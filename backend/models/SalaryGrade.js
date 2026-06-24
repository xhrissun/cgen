// FILE: cgen-main/backend/models/SalaryGrade.js

// backend/models/SalaryGrade.js

import mongoose from 'mongoose';

// Sub-schema for a single rate snapshot
const salaryGradeSnapshotSchema = new mongoose.Schema({
  // Effective from this date onward (until the next snapshot)
  effectiveDate: {
    type: Date,
    required: true
  },

  // B. BASIC SALARY
  basicSalary: {
    type: Number,
    required: true
  },

  // C. GROSS PREMIUM (15% OF BASIC SALARY)
  grossPremium: {
    type: Number,
    required: true
  },

  // D. DEDUCTIONS
  deductions: {
    sss:        { type: Number, required: true, default: 475.00 },
    pagibig:    { type: Number, required: true, default: 400.00 },
    philhealth: { type: Number, required: true, default: 0 }
  },

  // E. MONTHLY SALARY AS PER CONTRACT
  monthlySalaryAsPerContract: { type: Number, required: true },

  // F. DAILY SALARY AS PER CONTRACT
  dailySalaryAsPerContract:   { type: Number, required: true },

  // G. MONTHLY PREMIUM
  monthlyPremium: { type: Number, required: true },

  // Optional note about this revision
  note: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const salaryGradeSchema = new mongoose.Schema({
  // Grade identifier (can be 1-24 or special like 6.5, 6.6)
  grade: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    unique: true
  },

  // Flag for special salary grades (no premium calculation needed)
  isSpecialSalaryGrade: {
    type: Boolean,
    default: false
  },

  // Optional description
  description: String,

  // ── NEW: versioned rate history, sorted by effectiveDate ascending ──
  // The LAST entry (highest effectiveDate) is the "current" rate.
  // During contract generation we pick the entry whose effectiveDate
  // is <= the contract startDate.
  rateHistory: {
    type: [salaryGradeSnapshotSchema],
    default: []
  },

  // ── FLAT FIELDS kept for backward-compat with existing documents ──
  // They are auto-populated from rateHistory[latest] on save.
  basicSalary:                { type: Number },
  grossPremium:               { type: Number },
  deductions: {
    sss:        { type: Number },
    pagibig:    { type: Number },
    philhealth: { type: Number }
  },
  monthlySalaryAsPerContract: { type: Number },
  dailySalaryAsPerContract:   { type: Number },
  monthlyPremium:             { type: Number },

  createdAt:  { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now }
});

// ── Helper: get the rate snapshot applicable for a given contract date ──
salaryGradeSchema.methods.getRateForDate = function (contractDate) {
  if (!this.rateHistory || this.rateHistory.length === 0) {
    // Legacy document — return flat fields as a snapshot
    return {
      effectiveDate: this.createdAt || new Date(0),
      basicSalary:                this.basicSalary,
      grossPremium:               this.grossPremium,
      deductions:                 this.deductions,
      monthlySalaryAsPerContract: this.monthlySalaryAsPerContract,
      dailySalaryAsPerContract:   this.dailySalaryAsPerContract,
      monthlyPremium:             this.monthlyPremium
    };
  }

  const target = new Date(contractDate);

  // Sort ascending and pick the latest whose effectiveDate <= contractDate
  const sorted = [...this.rateHistory].sort(
    (a, b) => new Date(a.effectiveDate) - new Date(b.effectiveDate)
  );

  let applicable = null;
  for (const snapshot of sorted) {
    if (new Date(snapshot.effectiveDate) <= target) {
      applicable = snapshot;
    }
  }

  // If no snapshot is on or before the contract date, fall back to the
  // earliest available (edge case: contract predates all known rates)
  if (!applicable) {
    applicable = sorted[0];
  }

  return applicable;
};

// ── Keep flat fields in sync with the latest rateHistory entry ──
salaryGradeSchema.pre('save', function (next) {
  this.updatedAt = new Date();

  if (this.rateHistory && this.rateHistory.length > 0) {
    const latest = [...this.rateHistory].sort(
      (a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate)
    )[0];

    this.basicSalary                = latest.basicSalary;
    this.grossPremium               = latest.grossPremium;
    this.deductions                 = latest.deductions;
    this.monthlySalaryAsPerContract = latest.monthlySalaryAsPerContract;
    this.dailySalaryAsPerContract   = latest.dailySalaryAsPerContract;
    this.monthlyPremium             = latest.monthlyPremium;
  }

  next();
});

export default mongoose.model('SalaryGrade', salaryGradeSchema);