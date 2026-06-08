import mongoose from 'mongoose';

const signatorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  designation: { type: String, required: true },
  
  // Signatory role types
  role: { 
    type: String, 
    enum: [
      'RECOMMENDING_APPROVAL',
      'FUNDS_AVAILABLE_ACCOUNTANT',
      'FUNDS_AVAILABLE_FINANCE',
      'FIRST_PARTY',
      'APPROVER',
      'SUPERVISOR'
    ],
    required: true 
  },
  
  // Additional info for First Party
  title: { type: String }, // e.g., CESO III
  
  isActive: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Index for efficient queries
signatorySchema.index({ role: 1, isActive: 1 });

export default mongoose.model('Signatory', signatorySchema);