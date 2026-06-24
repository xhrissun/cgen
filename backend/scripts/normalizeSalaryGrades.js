/**
 * One-time migration: normalizes all SalaryGrade documents so that:
 *   1. `grade` is always stored as a STRING ("1", "10", "6.5", "LR-RIZAL").
 *   2. `periodStartDate` and `periodEndDate` are always UTC midnight.
 *   3. Drops ALL old indexes and rebuilds only the correct compound unique index.
 *
 * Usage (from repo root):
 *   node backend/scripts/normalizeSalaryGrades.js
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

import mongoose from 'mongoose';
import connectDB from '../database.js';

await connectDB();

const col = mongoose.connection.collection('salarygrades');

// ── Step 1: Drop ALL non-_id indexes to clear any stale/conflicting ones ──────
console.log('\n── Step 1: Dropping all existing indexes (except _id)...');
try {
  await col.dropIndexes();
  console.log('   All indexes dropped.');
} catch (e) {
  console.log('   dropIndexes warning (safe to ignore):', e.message);
}

// ── Step 2: Normalize every document ─────────────────────────────────────────
console.log('\n── Step 2: Normalizing documents...');

const toUTCMidnight = (d) => {
  if (!d) return null;
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
};

const docs = await col.find({}).toArray();
let normalized = 0;
let skipped    = 0;

for (const sg of docs) {
  const gradeStr   = String(sg.grade).trim();
  const startFixed = toUTCMidnight(sg.periodStartDate);
  const endFixed   = sg.periodEndDate ? toUTCMidnight(sg.periodEndDate) : null;

  const gradeChanged = typeof sg.grade !== 'string' || sg.grade !== gradeStr;
  const startChanged = startFixed && new Date(sg.periodStartDate).getTime() !== startFixed.getTime();
  const endChanged   = endFixed && sg.periodEndDate &&
    new Date(sg.periodEndDate).getTime() !== endFixed.getTime();

  if (!gradeChanged && !startChanged && !endChanged) {
    skipped++;
    continue;
  }

  const update = { grade: gradeStr };
  if (startFixed) update.periodStartDate = startFixed;
  if (endFixed)   update.periodEndDate   = endFixed;

  await col.updateOne({ _id: sg._id }, { $set: update });

  console.log(
    `   ✓ _id ${sg._id}:`,
    gradeChanged ? `grade ${JSON.stringify(sg.grade)} (${typeof sg.grade}) → "${gradeStr}"` : '',
    startChanged ? `| periodStartDate → ${startFixed.toISOString()}` : '',
    endChanged   ? `| periodEndDate → ${endFixed.toISOString()}` : ''
  );
  normalized++;
}

console.log(`   Done. Normalized: ${normalized}, Already clean (skipped): ${skipped}`);

// ── Step 3: Recreate the single correct compound unique index ─────────────────
console.log('\n── Step 3: Recreating compound unique index { grade, periodStartDate }...');
await col.createIndex(
  { grade: 1, periodStartDate: 1 },
  { unique: true, name: 'grade_1_periodStartDate_1' }
);
console.log('   Index created successfully.');

console.log('\n✅ Migration complete. All salary grades are now normalized.\n');
await mongoose.disconnect();