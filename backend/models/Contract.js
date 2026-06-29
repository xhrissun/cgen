// backend/models/Contract.js

import mongoose from 'mongoose';

const contractSchema = new mongoose.Schema({
  contractNumber: { type: String, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mode: { type: String, enum: ['NEW', 'RENEWAL'], required: true },
  
  // Contract Period
  year: { type: Number, required: true },
  semester: { type: Number, enum: [1, 2], required: true }, // 1 = First, 2 = Second
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  
  // Position Details
  positionCode: { type: String, required: true }, // Add this
  position: { type: String, required: true },
  placeOfAssignment: { type: String, required: true },
  dutiesAndResponsibilities: [{ type: String }],
  
  // Salary Grade Reference
  salaryGrade: { 
    type: mongoose.Schema.Types.Mixed,
    required: true 
  },
  isSpecialSalaryGrade: { type: Boolean, default: false },
  
  // ALL COPIED FROM SALARY GRADE (no calculation, just storage)
  basicSalary: { type: Number, required: true },
  basicSalaryInWords: String,
  
  grossPremium: { type: Number, required: true },
  
  deductions: {
    sss: { type: Number, required: true },
    pagibig: { type: Number, required: true },
    philhealth: { type: Number, required: true },
    total: { type: Number, required: true }
  },
  
  monthlySalaryAsPerContract: { type: Number, required: true },
  monthlySalaryAsPerContractInWords: String,
  
  dailySalaryAsPerContract: { type: Number, required: true },
  dailySalaryAsPerContractInWords: String,
  
  monthlyPremium: { type: Number, required: true },
  monthlyPremiumInWords: String,
  
  // CALCULATED FIELDS (based on working days)
  // H. MID-YEAR BONUS or I. YEAR-END BONUS
  finalPremium: { type: Number, required: true }, // Calculated from working days
  finalPremiumInWords: String,
  
  bonusType: { type: String, enum: ['Mid-Year', 'Year-End'], required: true },
  
  // Working Days Breakdown (for audit trail)
  workingDaysBreakdown: [{
    monthKey: String,
    year: Number,
    month: Number,
    monthName: String,
    totalWorkingDaysInMonth: Number,
    actualWorkingDaysInRange: Number,
    contractStartDay: Number,
    contractEndDay: Number,
    monthlyPremiumRate: Number,
    dailyPremiumRate: Number,
    calculatedPremium: Number,
    isFullMonth: Boolean,
    holidaysInMonth: [{
      date: String,
      name: String,
      type: String
    }]
  }],
  
  // Premium Summary
  premiumSummary: {
    totalMonths: Number,
    fullMonths: Number,
    partialMonths: Number,
    totalWorkingDays: Number
  },
  
  charging: String,

  approverBranch: {
    type: String,
    enum: ['MANAGEMENT', 'TECHNICAL'],
    default: 'MANAGEMENT'
  },
  
  // Signatories
  signatories: {
    firstParty: {
      name: String,
      position: String,
      title: String
    },
    secondParty: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approver: {
      name: String,
      position: String
    },
    supervisor: {
      name: String,
      position: String
    },
    accountant: {
      name: String,
      position: String
    },
    financeChief: {
      name: String,
      position: String
    }
  },
  
  // Contract Clauses
  clauses: [{
    clauseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clause' },
    customContent: String
  }],

  // Add to the schema before the status field
  signedContractFile: {
    filename: String,
    originalName: String,
    key: String,   // R2 object key for deletion
    url: String,   // Public URL for download
  },

archivedAt: Date,
archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
isArchived: { type: Boolean, default: false },
  
  status: { 
    type: String, 
    enum: ['DRAFT', 'PENDING', 'APPROVED', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'CANCELLED'],
    default: 'DRAFT'
  },
  
  generatedDate: Date,
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Auto-generate contract number
// Enhanced version with retry logic for race conditions

contractSchema.pre('save', async function(next) {
  if (!this.contractNumber) {
    const maxRetries = 5;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        const year = new Date().getFullYear();
        const prefix = `CONTRACT-${year}-`;
        
        // Find the highest existing contract number for this year
        const lastContract = await mongoose.model('Contract')
          .findOne({ 
            contractNumber: { $regex: `^${prefix}` } 
          })
          .sort({ contractNumber: -1 })
          .select('contractNumber')
          .lean();
        
        let nextNumber = 1;
        
        if (lastContract && lastContract.contractNumber) {
          const match = lastContract.contractNumber.match(/CONTRACT-\d{4}-(\d+)$/);
          if (match) {
            nextNumber = parseInt(match[1], 10) + 1;
          }
        }
        
        // Add attempt offset to handle race conditions
        nextNumber += attempt;
        
        // Generate new contract number
        this.contractNumber = `${prefix}${String(nextNumber).padStart(5, '0')}`;
        
        console.log(`✓ Generated contract number: ${this.contractNumber} (attempt ${attempt + 1})`);
        break; // Success, exit loop
        
      } catch (error) {
        attempt++;
        if (attempt >= maxRetries) {
          console.error('❌ Failed to generate contract number after max retries');
          return next(error);
        }
        // Wait briefly before retry
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
      }
    }
  }
  next();
});

// Performance indexes
contractSchema.index({ userId: 1, contractNumber: -1 }); // covers /check-existing sort
contractSchema.index({ userId: 1, status: 1 });           // covers active contract lookups
contractSchema.index({ placeOfAssignment: 1, status: 1 });// covers FOCAL_PERSON queries
contractSchema.index({ createdAt: -1 });                  // covers dashboard sorts

export default mongoose.model('Contract', contractSchema);