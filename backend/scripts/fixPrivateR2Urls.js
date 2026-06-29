/**
 * fixPrivateR2Urls.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time migration: finds any User documents or Contract documents where
 * a photo/file URL was accidentally stored as the private R2 storage endpoint
 * (https://<accountId>.r2.cloudflarestorage.com/...) and replaces it with
 * either the correct public URL (if R2_PUBLIC_URL is set) or just the R2 key
 * (so the backend proxy can serve it).
 *
 * USAGE:
 *   DRY_RUN=true node backend/scripts/fixPrivateR2Urls.js   ← preview only
 *   node backend/scripts/fixPrivateR2Urls.js                ← apply fixes
 * ─────────────────────────────────────────────────────────────────────────────
 */

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DRY_RUN = process.env.DRY_RUN === 'true';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
const PRIVATE_R2_HOST = '.r2.cloudflarestorage.com';

// ─── Minimal schemas (strict:false so we don't need full definitions) ────────
const User     = mongoose.model('User',     new mongoose.Schema({}, { strict: false }));
const Contract = mongoose.model('Contract', new mongoose.Schema({}, { strict: false }));

/**
 * Given a private R2 URL, extract just the object key.
 * Private URL format: https://<accountId>.r2.cloudflarestorage.com/<bucket>/<key>
 */
function extractKey(privateUrl) {
  try {
    const parsed = new URL(privateUrl);
    const parts  = parsed.pathname.replace(/^\//, '').split('/');
    // First segment is the bucket name (no extension) — strip it
    const key = parts.length > 1 && !parts[0].includes('.') ? parts.slice(1).join('/') : parts.join('/');
    return key || null;
  } catch {
    return null;
  }
}

/**
 * Convert a private R2 URL → public URL or bare key.
 */
function fixUrl(privateUrl) {
  const key = extractKey(privateUrl);
  if (!key) return null;
  return R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : key;
}

function isPrivate(url) {
  return typeof url === 'string' && url.includes(PRIVATE_R2_HOST);
}

// ─────────────────────────────────────────────────────────────────────────────

async function fixUsers(auditRows) {
  const users = await User.find({}).lean();
  let fixed = 0;

  for (const user of users) {
    const updates = {};
    let dirty = false;

    // 1. personalInfo.profilePhoto
    const photo = user.personalInfo?.profilePhoto;
    if (isPrivate(photo)) {
      const newVal = fixUrl(photo);
      if (newVal) {
        console.log(`  [USER ${user._id}] profilePhoto: "${photo}" → "${newVal}"`);
        auditRows.push(`user,${user._id},profilePhoto,${photo},${newVal}`);
        updates['personalInfo.profilePhoto'] = newVal;
        dirty = true;
      }
    }

    // 2. documents[].filename and documents[].url
    const newDocs = (user.documents || []).map((doc, i) => {
      let changed = false;
      const d = { ...doc };
      if (isPrivate(d.filename)) {
        const nv = fixUrl(d.filename);
        if (nv) {
          console.log(`  [USER ${user._id}] doc[${i}].filename → "${nv}"`);
          auditRows.push(`user,${user._id},doc[${i}].filename,${d.filename},${nv}`);
          d.filename = nv;
          changed = true;
        }
      }
      if (isPrivate(d.url)) {
        const nv = fixUrl(d.url);
        if (nv) {
          console.log(`  [USER ${user._id}] doc[${i}].url → "${nv}"`);
          auditRows.push(`user,${user._id},doc[${i}].url,${d.url},${nv}`);
          d.url = nv;
          changed = true;
        }
      }
      if (changed) dirty = true;
      return d;
    });

    if (dirty) {
      if (!DRY_RUN) {
        await User.updateOne(
          { _id: user._id },
          { $set: { ...updates, documents: newDocs, updatedAt: new Date() } }
        );
      }
      fixed++;
    }
  }

  return fixed;
}

async function fixContracts(auditRows) {
  const contracts = await Contract.find({ 'signedContractFile.url': { $exists: true } }).lean();
  let fixed = 0;

  for (const contract of contracts) {
    const url = contract.signedContractFile?.url;
    if (!isPrivate(url)) continue;

    const newUrl = fixUrl(url);
    if (!newUrl) continue;

    console.log(`  [CONTRACT ${contract._id}] signedContractFile.url → "${newUrl}"`);
    auditRows.push(`contract,${contract._id},signedContractFile.url,${url},${newUrl}`);

    if (!DRY_RUN) {
      await Contract.updateOne(
        { _id: contract._id },
        { $set: { 'signedContractFile.url': newUrl, updatedAt: new Date() } }
      );
    }
    fixed++;
  }

  return fixed;
}

// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) { console.error('❌  MONGODB_URI not set.'); process.exit(1); }

  await mongoose.connect(mongoUri);
  console.log('✅  Connected to MongoDB');
  console.log(DRY_RUN ? '🔍  DRY RUN — no writes.\n' : '⚡  LIVE RUN — writing fixes.\n');
  console.log(`R2_PUBLIC_URL: ${R2_PUBLIC_URL || '(not set — will store keys only)'}\n`);

  const auditRows = ['type,id,field,oldValue,newValue'];

  console.log('── Users ──────────────────────────────────────────────');
  const userFixed = await fixUsers(auditRows);
  console.log(`Fixed ${userFixed} user(s)\n`);

  console.log('── Contracts ──────────────────────────────────────────');
  const contractFixed = await fixContracts(auditRows);
  console.log(`Fixed ${contractFixed} contract(s)\n`);

  const auditPath = path.join(__dirname, `fixPrivateR2Urls-audit-${Date.now()}.csv`);
  fs.writeFileSync(auditPath, auditRows.join('\n'), 'utf8');
  console.log(`📄  Audit written to: ${auditPath}`);
  console.log(`\nTotal fixed: ${userFixed + contractFixed} record(s)`);
  console.log(DRY_RUN ? '\n⚠️   DRY RUN — re-run without DRY_RUN=true to apply.' : '\n✅  Migration complete.');

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });