import mongoose from 'mongoose';

const changeLogSchema = new mongoose.Schema({
  actionType: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'DELETE'],
    required: true
  },
  entityType: {
    type: String,
    enum: ['User', 'Position', 'Contract', 'SalaryGrade', 'Clause', 'ClauseGroup', 'Holiday', 'Signatory'],
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  entityName: String,
  performedBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: String,
    role: String,
    placeOfAssignment: String
  },
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  ipAddress: String,
  userAgent: String
});

changeLogSchema.index({ timestamp: -1 });
changeLogSchema.index({ performedBy: 1 });
changeLogSchema.index({ entityType: 1 });

export default mongoose.model('ChangeLog', changeLogSchema);