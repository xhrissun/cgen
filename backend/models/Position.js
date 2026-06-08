import mongoose from 'mongoose';

const positionSchema = new mongoose.Schema({
  // Add unique position code
  positionCode: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    uppercase: true
  },
  
  title: { type: String, required: true },
  salaryGrade: { type: String, required: true },
  isSpecialSalaryGrade: { type: Boolean, default: false },
  specialSalaryAmount: Number,
  
  // Optional: Add a description to differentiate positions with same title
  description: { type: String, default: '' },

  needsClauseAssignment: { type: Boolean, default: false },
  
  dutiesAndResponsibilities: [{ type: String }],
  
  // Clause assignments - references to Clause model
  assignedClauses: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Clause' 
  }],
  
  placeOfAssignment: String,
  charging: String,
  premium: {
    hasMonthlyPremium: { type: Boolean, default: false },
    premiumRate: Number,
    premiumAmount: Number
  },
  
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Add index for faster queries
positionSchema.index({ title: 1, positionCode: 1 });

export default mongoose.model('Position', positionSchema);