// FILE: cgen-main/backend/models/SalaryGrade.js

// FILE: cgen-main/backend/models/SalaryGrade.js

import mongoose from 'mongoose';

/**
 * A SalaryGrade document represents ONE grade entry (e.g. Grade 10)
 * inside a specific salary grade PERIOD/SET.
 *
 * All grades that belong to the same period share the same
 * periodStartDate and periodEndDate — they are one "set".
 *
 * When contract generation needs the rate for Grade 10 on a given
 * contract start date, it calls:
 *   SalaryGrade.getRateForGradeAndDate(grade, contractStartDate)
 * which picks the document whose period covers that date.
 */
const salaryGradeSchema = new mongoose.Schema({

  // Grade identifier (1–24 or special like 6.5, 6.6)
  grade: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

  // ── Period this grade entry belongs to ──────────────────────────────
  // All grades in the same "set" share these two dates.
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

// Compound index: one grade per period (no duplicates within the same set)
salaryGradeSchema.index({ grade: 1, periodStartDate: 1 }, { unique: true });

salaryGradeSchema.pre('save', function (next) {
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

  // Try exact numeric match first, then string
  const gradeNum = parseFloat(grade);
  const gradeQuery = isNaN(gradeNum)
    ? { grade }
    : { grade: { $in: [grade, gradeNum] } };

  // Find all period entries for this grade, sorted newest-first
  const docs = await this.find(gradeQuery).sort({ periodStartDate: -1 });

  if (!docs.length) return null;

  // Pick the entry whose period covers the contract date
  for (const doc of docs) {
    const start = new Date(doc.periodStartDate);
    const end   = doc.periodEndDate ? new Date(doc.periodEndDate) : null;

    const afterStart = target >= start;
    const beforeEnd  = !end || target <= end;

    if (afterStart && beforeEnd) return doc;
  }

  // Fallback: use the most recent period (covers contracts before any set existed)
  return docs[0];
};

export default mongoose.model('SalaryGrade', salaryGradeSchema);