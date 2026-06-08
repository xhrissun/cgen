import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'POSITION_NEEDS_CLAUSES',
      'USER_CREATED',
      'USER_UPDATED',
      'USER_DELETED',
      'POSITION_CREATED',
      'POSITION_UPDATED',
      'POSITION_DELETED',
      'CONTRACT_CREATED',
      'CONTRACT_UPDATED',
      'CONTRACT_DELETED',
      'CHARGING_NEEDED',
      'SALARY_GRADE_CREATED',
      'SALARY_GRADE_UPDATED',
      'CLAUSE_CREATED',
      'CLAUSE_UPDATED',
      'CLAUSE_DELETED',
      'HOLIDAY_CREATED',
      'HOLIDAY_UPDATED',
      'HOLIDAY_DELETED'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedModel'
  },
  relatedModel: {
    type: String,
    enum: ['User', 'Position', 'Contract', 'SalaryGrade', 'Clause', 'Holiday']
  },
  actionBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    role: String,
    placeOfAssignment: String
  },
  isRead: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Notification', notificationSchema);