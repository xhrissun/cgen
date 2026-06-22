import mongoose from 'mongoose';

const ClauseGroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  // Ordered array — position in this array IS the render order within the group
  clauses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Clause'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

export default mongoose.model('ClauseGroup', ClauseGroupSchema);