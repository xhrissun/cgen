// FILE: cgen-main/backend/scripts/migrateSalaryGradeHistory.js

/**
 * migrateSalaryGradeHistory.js
 *
 * One-time migration: for every SalaryGrade document that has no rateHistory,
 * seed rateHistory with a single snapshot built from the existing flat fields.
 * The snapshot's effectiveDate is set to the document's createdAt (or epoch as
 * fallback) so it covers all contracts ever generated with these values.
 *
 * Usage (run from anywhere inside the project):
 *   node backend/scripts/migrateSalaryGradeHistory.js
 *
 * Safe to run multiple times — documents that already have rateHistory are skipped.
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

// Load .env from backend/ regardless of where the script is invoked from
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

import mongoose from 'mongoose';
import connectDB from '../database.js';
import SalaryGrade from '../models/SalaryGrade.js';

await connectDB();

const grades = await SalaryGrade.find({});
let migrated = 0;
let skipped = 0;

for (const sg of grades) {
  if (sg.rateHistory && sg.rateHistory.length > 0) {
    skipped++;
    continue;
  }

  const effectiveDate = sg.createdAt || new Date(0);

  sg.rateHistory = [{
    effectiveDate,
    basicSalary:                sg.basicSalary                || 0,
    grossPremium:               sg.grossPremium               || 0,
    deductions: {
      sss:        sg.deductions?.sss        || 475.00,
      pagibig:    sg.deductions?.pagibig    || 400.00,
      philhealth: sg.deductions?.philhealth || 0
    },
    monthlySalaryAsPerContract: sg.monthlySalaryAsPerContract || 0,
    dailySalaryAsPerContract:   sg.dailySalaryAsPerContract   || 0,
    monthlyPremium:             sg.monthlyPremium             || 0,
    note: 'Migrated from legacy flat fields'
  }];

  await sg.save();
  console.log(`✓ SG ${sg.grade} — seeded rateHistory with effectiveDate ${effectiveDate.toISOString().split('T')[0]}`);
  migrated++;
}

console.log(`\nDone. Migrated: ${migrated}, Skipped (already had history): ${skipped}`);
await mongoose.disconnect();