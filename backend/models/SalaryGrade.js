// FILE: cgen-main/backend/models/SalaryGrade.js

import mongoose from 'mongoose';

/**
 * A SalaryGrade document represents ONE grade entry (e.g. Grade 10)
 * inside a specific salary grade PERIOD/SET.
 *
 * All grades that belong to the same period share the same
 * periodStartDate and periodEndDate — they are one "set".
 *
 * IMPORTANT: `grade` is always stored as a STRING (e.g. "1", "10", "6.5", "LR-RIZAL").
 * Using String instead of Mixed ensures the unique compound index
 * { grade, periodStartDate } behaves consistently regardless of how
 * the value was originally inserted (number vs string in legacy data).
 *
 * Sorting is done in application code using parseFloat() with non-numeric
 * grades sorted alphabetically after numeric ones.
 */
const salaryGradeSchema = new mongoose.Schema({

  // Grade identifier — always a String: "1"–"24", "6.5", "LR-RIZAL", etc.
  grade: {
    type: String,
    required: true
  },

  // ── Period this grade entry belongs to ──────────────────────────────
  // All grades in the same "set" share these two dates (stored as UTC midnight).
  periodStartDate: {
    type: Date,
    required: true
  },
  // null/undefined = open-ended (still active)
  periodEndDate: {
    type: Date,
    default: null
  },

  // Optional label for the set, e.g. "FY 2026 Salary Schedule"
  periodLabel: {
    type: String,
    default: ''
  },

  // ── Rate fields ──────────────────────────────────────────────────────
  isSpecialSalaryGrade: { type: Boolean, default: false },
  description:          { type: String,  default: '' },

  basicSalary:                { type: Number, required: true },
  grossPremium:               { type: Number, default: 0 },
  deductions: {
    sss:        { type: Number, default: 475.00 },
    pagibig:    { type: Number, default: 400.00 },
    philhealth: { type: Number, default: 0 }
  },
  monthlySalaryAsPerContract: { type: Number, required: true },
  dailySalaryAsPerContract:   { type: Number, required: true },
  monthlyPremium:             { type: Number, default: 0 },

  note:      { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Compound index: one grade string per period — unambiguous because grade is always String
salaryGradeSchema.index({ grade: 1, periodStartDate: 1 }, { unique: true });

salaryGradeSchema.pre('save', function (next) {
  // Ensure grade is always stored as string
  if (typeof this.grade !== 'string') {
    this.grade = String(this.grade);
  }
  this.updatedAt = new Date();
  next();
});

/**
 * Static helper used by contract generation.
 * Returns the SalaryGrade document for `grade` whose period covers `contractDate`.
 * Falls back to the most recent period if none explicitly covers the date.
 */
salaryGradeSchema.statics.getRateForGradeAndDate = async function (grade, contractDate) {
  const target = new Date(contractDate);

  // Always query as string — covers both "10" and 10 passed in from callers
  const gradeStr = String(grade);

  // Find all period entries for this grade, sorted newest-first
  const docs = await this.find({ grade: gradeStr }).sort({ periodStartDate: -1 });

  if (!docs.length) return null;

  // Pick the entry whose period covers the contract date
  for (const doc of docs) {
    const start = new Date(doc.periodStartDate);
    const end   = doc.periodEndDate ? new Date(doc.periodEndDate) : null;

    const afterStart = target >= start;
    const beforeEnd  = !end || target <= end;

    if (afterStart && beforeEnd) return doc;
  }

  // Fallback: use the most recent period
  return docs[0];
};

export default mongoose.model('SalaryGrade', salaryGradeSchema);