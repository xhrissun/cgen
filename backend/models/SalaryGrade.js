// backend/models/SalaryGrade.js

import mongoose from 'mongoose';

const salaryGradeSchema = new mongoose.Schema({
  // Grade identifier (can be 1-24 or special like 6.5, 6.6)
  grade: { 
    type: mongoose.Schema.Types.Mixed, 
    required: true, 
    unique: true 
  },
  
  // ALL FIELDS MANUALLY ENTERED BY USER
  
  // A. SALARY GRADE - already in 'grade' field above
  
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
  
  // D. DEDUCTIONS (SSS, PAGIBIG, PHILHEALTH, DRUG TEST)
  deductions: {
    sss: { type: Number, required: true, default: 475.00 },
    pagibig: { type: Number, required: true, default: 400.00 },
    philhealth: { type: Number, required: true, default: 0 }
  },
  
  // E. MONTHLY SALARY AS PER CONTRACT (SUM OF BASIC SALARY AND DEDUCTIONS)
  monthlySalaryAsPerContract: { 
    type: Number, 
    required: true 
  },
  
  // F. DAILY SALARY AS PER CONTRACT (MONTHLY SALARY ÷ 22)
  dailySalaryAsPerContract: { 
    type: Number, 
    required: true 
  },
  
  // G. MONTHLY PREMIUM (GROSS PREMIUM MINUS DEDUCTIONS)
  monthlyPremium: { 
    type: Number, 
    required: true 
  },
  
  // Flag for special salary grades (no premium calculation needed)
  isSpecialSalaryGrade: { 
    type: Boolean, 
    default: false 
  },
  
  // Optional description
  description: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update timestamp on save
salaryGradeSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model('SalaryGrade', salaryGradeSchema);