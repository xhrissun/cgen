/**
 * updateCosRoles.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Migration script: Update roles and/or usernames for COS employees as
 * mandated by the new Regional Special Order.
 *
 * SAFETY GUARANTEE:
 *   Past contracts are NOT affected. The Contract model stores position,
 *   salary, and signatory data as snapshots at generation time. Contracts
 *   reference users only via ObjectId (userId), never by username or role
 *   string. Updating a user's role/username here does NOT alter any existing
 *   contract document.
 *
 * USAGE:
 *   1. Edit ROLE_UPDATES below to reflect the new Special Order assignments.
 *   2. Run:  node backend/scripts/updateCosRoles.js
 *   3. The script logs every change and writes a CSV audit trail.
 *
 * DRY RUN (no writes):
 *   DRY_RUN=true node backend/scripts/updateCosRoles.js
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the backend folder — works regardless of where the script is run from
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const DRY_RUN = process.env.DRY_RUN === 'true';

// ─────────────────────────────────────────────────────────────────────────────
// ✏️  CONFIGURE YOUR UPDATES HERE
//
// Each entry can specify:
//   matchBy       : 'username' | 'userId'  — how to find the user
//   value         : current username or MongoDB ObjectId string
//   newRole       : (optional) new role to assign
//   newUsername   : (optional) new username to assign
//
// Valid roles: ADMINISTRATOR | CONTRACTUAL | FOCAL_PERSON | FINANCE_OFFICER
//
// Example:
//   { matchBy: 'username', value: 'jdelacruz',  newRole: 'FOCAL_PERSON' },
//   { matchBy: 'username', value: 'mreyes',      newUsername: 'mreyes_cos', newRole: 'CONTRACTUAL' },
// ─────────────────────────────────────────────────────────────────────────────
const ROLE_UPDATES = [
  // { matchBy: 'username', value: 'old_username', newRole: 'NEW_ROLE', newUsername: 'new_username' },
];

const VALID_ROLES = ['ADMINISTRATOR', 'CONTRACTUAL', 'FOCAL_PERSON', 'FINANCE_OFFICER'];

// ─────────────────────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  username: String,
  role: String,
  status: String,
  placeOfAssignment: String,
  personalInfo: mongoose.Schema.Types.Mixed,
  updatedAt: Date,
}, { strict: false });

const User = mongoose.models.User || mongoose.model('User', userSchema);

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌  MONGODB_URI not set in environment. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('✅  Connected to MongoDB');
  console.log(DRY_RUN ? '🔍  DRY RUN — no writes will occur.\n' : '⚡  LIVE RUN — changes will be saved.\n');

  if (ROLE_UPDATES.length === 0) {
    console.warn('⚠️   ROLE_UPDATES is empty. Edit the script and add your update entries.');
    await mongoose.disconnect();
    return;
  }

  const auditRows = ['timestamp,matchBy,value,field,oldValue,newValue,status'];
  const ts = new Date().toISOString();
  let successCount = 0;
  let errorCount = 0;

  for (const entry of ROLE_UPDATES) {
    const { matchBy, value, newRole, newUsername } = entry;

    if (!matchBy || !value) {
      console.error(`❌  Skipping invalid entry (missing matchBy or value):`, entry);
      errorCount++;
      continue;
    }

    if (newRole && !VALID_ROLES.includes(newRole)) {
      console.error(`❌  Invalid role "${newRole}" for ${value}. Valid: ${VALID_ROLES.join(', ')}`);
      errorCount++;
      continue;
    }

    // Find the user
    let query;
    if (matchBy === 'userId') {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        console.error(`❌  Invalid ObjectId "${value}"`);
        errorCount++;
        continue;
      }
      query = { _id: new mongoose.Types.ObjectId(value) };
    } else {
      query = { username: value };
    }

    const user = await User.findOne(query);
    if (!user) {
      console.warn(`⚠️   User not found: ${matchBy}=${value}`);
      auditRows.push(`${ts},${matchBy},${value},—,—,—,NOT_FOUND`);
      errorCount++;
      continue;
    }

    // Check username uniqueness if changing
    if (newUsername && newUsername !== user.username) {
      const conflict = await User.findOne({ username: newUsername, _id: { $ne: user._id } });
      if (conflict) {
        console.error(`❌  Username "${newUsername}" is already taken. Skipping ${value}.`);
        auditRows.push(`${ts},${matchBy},${value},username,${user.username},${newUsername},USERNAME_CONFLICT`);
        errorCount++;
        continue;
      }
    }

    const changes = {};
    if (newRole && newRole !== user.role) {
      changes.role = { before: user.role, after: newRole };
    }
    if (newUsername && newUsername !== user.username) {
      changes.username = { before: user.username, after: newUsername };
    }

    if (Object.keys(changes).length === 0) {
      console.log(`ℹ️   No changes needed for ${user.username} (${user.role})`);
      continue;
    }

    console.log(`→ User: ${user.username} (${user._id})`);
    for (const [field, { before, after }] of Object.entries(changes)) {
      console.log(`    ${field}: "${before}" → "${after}"`);
      auditRows.push(`${ts},${matchBy},${value},${field},${before},${after},${DRY_RUN ? 'DRY_RUN' : 'APPLIED'}`);
    }

    if (!DRY_RUN) {
      const updatePayload = { updatedAt: new Date() };
      if (changes.role)     updatePayload.role     = changes.role.after;
      if (changes.username) updatePayload.username = changes.username.after;

      await User.updateOne({ _id: user._id }, { $set: updatePayload });
      console.log(`    ✅  Saved.`);
    }

    successCount++;
  }

  // Write audit CSV
  const auditPath = path.join(__dirname, `cos-role-update-audit-${Date.now()}.csv`);
  fs.writeFileSync(auditPath, auditRows.join('\n'), 'utf8');
  console.log(`\n📄  Audit trail written to: ${auditPath}`);
  console.log(`\nSummary: ${successCount} updated, ${errorCount} errors/skipped.`);
  console.log(DRY_RUN ? '\n⚠️   DRY RUN complete. Re-run without DRY_RUN=true to apply.' : '\n✅  Migration complete.');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});