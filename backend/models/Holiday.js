import mongoose from 'mongoose';

const holidaySchema = new mongoose.Schema({
  name: { type: String, required: true },
  date: { type: Date, required: true },
  type: { 
    type: String, 
    enum: ['REGULAR', 'SPECIAL_NON_WORKING', 'SPECIAL_WORKING'],
    required: true 
  },
  year: { type: Number, required: true },
  
  // Premium rates for different holiday types
  premiumRate: { 
    type: Number, 
    default: function() {
      switch(this.type) {
        case 'REGULAR': return 200; // 200% (100% base + 100% premium)
        case 'SPECIAL_NON_WORKING': return 130; // 130% (100% base + 30% premium)
        case 'SPECIAL_WORKING': return 100; // 100% (no premium)
        default: return 100;
      }
    }
  },
  
  isRecurring: { type: Boolean, default: false },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Index for efficient date queries
holidaySchema.index({ date: 1, year: 1 });

export default mongoose.model('Holiday', holidaySchema);