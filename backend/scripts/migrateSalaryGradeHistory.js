// FILE: cgen-main/backend/scripts/migrateSalaryGradeHistory.js

// FILE: cgen-main/backend/scripts/migrateSalaryGradeHistory.js

/**
 * One-time migration: stamps all existing SalaryGrade documents with
 * periodStartDate = January 1, 2026  and  periodEndDate = null (open).
 *
 * Run once after deploying the new period-based schema.
 * Safe to run multiple times — documents already stamped are skipped.
 *
 * Usage (from the CGEN root):
 *   node backend/scripts/migrateSalaryGradeHistory.js
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

import mongoose from 'mongoose';
import connectDB from '../database.js';
import SalaryGrade from '../models/SalaryGrade.js';

await connectDB();

// All legacy grades belong to the inaugural period: Jan 1 2026 – open
const INITIAL_START = new Date('2026-01-01T00:00:00.000Z');

const grades = await SalaryGrade.find({});
let migrated = 0;
let skipped  = 0;

for (const sg of grades) {
  if (sg.periodStartDate) {
    // Already migrated
    skipped++;
    continue;
  }

  sg.periodStartDate = INITIAL_START;
  sg.periodEndDate   = null;
  sg.periodLabel     = 'FY 2026 Salary Schedule';

  // Remove the old rateHistory field if it exists (from previous migration attempt)
  if (sg.rateHistory !== undefined) {
    sg.rateHistory = undefined;
  }

  await sg.save();
  console.log(`✓ SG ${sg.grade} — stamped periodStartDate = 2026-01-01`);
  migrated++;
}

console.log(`\nDone. Migrated: ${migrated}, Already stamped (skipped): ${skipped}`);
await mongoose.disconnect();