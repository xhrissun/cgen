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
  
  // Ad-hoc/individual clause assignments NOT coming from a clause group.
  // Clauses that arrive via a group are NOT copied in here anymore — they are
  // resolved live from assignedClauseGroups (see clauseResolver.js). This is
  // what makes clause-group edits propagate to every position using that group.
  assignedClauses: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Clause' 
  }],

  // Clause groups linked to this position. The actual clauses are resolved
  // live (not snapshotted) so that editing a group's clauses automatically
  // updates every position — and every still-unsigned contract — that uses it.
  assignedClauseGroups: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClauseGroup'
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