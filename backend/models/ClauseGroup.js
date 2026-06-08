import mongoose from 'mongoose';

const ClauseGroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
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