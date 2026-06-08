import mongoose from 'mongoose';

const clauseSchema = new mongoose.Schema({
  clauseNumber: { type: Number, required: true },
  title: { type: String },
  content: { type: String, required: true },
  isBeforeWitnesseth: { type: Boolean, default: false },
  isFixed: { type: Boolean, default: false },
  
  // Special clause types for dynamic content
  clauseType: { 
    type: String, 
    enum: ['NORMAL', 'PRIMARY', 'SECONDARY', 'TERTIARY'],
    default: 'NORMAL'
  },
  
  // Variables that can be replaced in the clause
  variables: [{
    name: String,
    description: String,
    dataType: { type: String, enum: ['TEXT', 'NUMBER', 'DATE', 'CURRENCY'] }
  }],
  
  // Clause groups for easy assignment
  groups: [{ type: String }],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('Clause', clauseSchema);