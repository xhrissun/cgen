/**
 * REPAIR MIGRATION SCRIPT
 * 
 * Fixes document records that ended up in inconsistent states after previous
 * migration attempts. Ensures every document has:
 *   - filename: full R2 public URL (https://...)
 *   - url:      full R2 public URL (same as filename, explicit copy)
 *   - key:      R2 object key only (e.g. "documents/file.jpg")
 *
 * Run from backend folder:
 *   node scripts/fixDocumentUrls.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL?.replace(/\/$/, ''); // strip trailing slash

if (!R2_PUBLIC_URL) {
  console.error('❌ R2_PUBLIC_URL not set in .env');
  process.exit(1);
}

/**
 * Given whatever mess is stored in filename/url/key, return the canonical triple.
 * Returns null if we can't determine anything useful.
 */
const canonicalize = (doc) => {
  let key = null;
  let fullUrl = null;

  // Prefer whichever field looks most reliable
  const candidates = [doc.url, doc.filename, doc.key].filter(Boolean);

  for (const c of candidates) {
    if (c.startsWith('http')) {
      // It's a full URL — extract key from it
      try {
        const u = new URL(c);
        // Key is everything after the leading slash
        const k = u.pathname.replace(/^\//, '');
        if (k) { key = k; fullUrl = `${R2_PUBLIC_URL}/${k}`; break; }
      } catch { /* ignore malformed */ }
    } else if (c.includes('/')) {
      // It's already a key like "documents/file.jpg"
      key = c;
      fullUrl = `${R2_PUBLIC_URL}/${c}`;
      break;
    }
    // Single-segment legacy filename — we can't reliably know the subfolder
    // unless we infer from doc.type
  }

  // Last resort: infer subfolder from doc.type for short filenames
  if (!key) {
    const raw = candidates.find(c => c && !c.startsWith('http') && !c.includes('/'));
    if (raw) {
      const subfolder =
        doc.type === 'SIGNED_CONTRACT' ? 'signed-contracts' : 'documents';
      key = `${subfolder}/${raw}`;
      fullUrl = `${R2_PUBLIC_URL}/${key}`;
    }
  }

  if (!key) return null;
  return { key, fullUrl };
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  const users = await User.find({});
  let totalUsers = 0, totalDocs = 0, totalPhotos = 0;

  for (const user of users) {
    let changed = false;

    // --- Fix personalInfo.profilePhoto ---
    const photo = user.personalInfo?.profilePhoto;
    if (photo && !photo.startsWith('http')) {
      // It's a raw key or legacy filename
      const subfolder = photo.includes('/') ? '' : 'profile-photos/';
      const key = photo.includes('/') ? photo : `profile-photos/${photo}`;
      const newUrl = `${R2_PUBLIC_URL}/${key}`;
      console.log(`  📸 profilePhoto: "${photo}" → "${newUrl}"`);
      user.personalInfo.profilePhoto = newUrl;
      user.markModified('personalInfo');
      changed = true;
      totalPhotos++;
    }

    // --- Fix documents array ---
    for (let i = 0; i < user.documents.length; i++) {
      const doc = user.documents[i];
      const canon = canonicalize(doc);

      if (!canon) {
        console.warn(`  ⚠️  Cannot resolve doc[${i}] type=${doc.type} for user ${user.username} — skipping`);
        continue;
      }

      const needsFix =
        doc.filename !== canon.fullUrl ||
        doc.url !== canon.fullUrl ||
        doc.key !== canon.key;

      if (needsFix) {
        console.log(`  📄 doc[${doc.type}]: key="${canon.key}"`);
        if (doc.filename !== canon.fullUrl) console.log(`       filename: "${doc.filename}" → "${canon.fullUrl}"`);
        if (doc.url !== canon.fullUrl)      console.log(`       url:      "${doc.url}" → "${canon.fullUrl}"`);
        if (doc.key !== canon.key)          console.log(`       key:      "${doc.key}" → "${canon.key}"`);

        user.documents[i].filename = canon.fullUrl;
        user.documents[i].url      = canon.fullUrl;
        user.documents[i].key      = canon.key;
        user.markModified('documents');
        changed = true;
        totalDocs++;
      }
    }

    if (changed) {
      await user.save();
      totalUsers++;
      console.log(`✅ Saved: ${user.username} (${user._id})\n`);
    }
  }

  console.log('=== REPAIR COMPLETE ===');
  console.log(`Users updated:    ${totalUsers}`);
  console.log(`Profile photos:   ${totalPhotos}`);
  console.log(`Documents fixed:  ${totalDocs}`);

  await mongoose.disconnect();
};

run().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});