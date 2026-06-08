// backend/utils/activityLogger.js
import ChangeLog from '../models/ChangeLog.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';

export const logActivity = async ({
  actionType,
  entityType,
  entityId,
  entityName,
  performedBy,
  changesBefore,
  changesAfter,
  req
}) => {
  try {
    const user = await User.findById(performedBy);
    
    if (!user) {
      console.error('User not found for activity logging');
      return;
    }
    
    // Create change log entry
    const changeLog = new ChangeLog({
      actionType,
      entityType,
      entityId,
      entityName,
      performedBy: {
        userId: performedBy,
        username: user.username,
        role: user.role,
        placeOfAssignment: user.placeOfAssignment
      },
      changes: {
        before: changesBefore,
        after: changesAfter
      },
      ipAddress: req?.ip,
      userAgent: req?.get('user-agent')
    });
    
    await changeLog.save();
    
    // Create notifications for admins with better formatting
    const admins = await User.find({ role: 'ADMINISTRATOR' });
    
    if (admins.length === 0) {
      console.log('No administrators found to notify');
      return;
    }
    
    // Better user name formatting
    const userName = user.personalInfo?.firstName 
      ? `${user.personalInfo.firstName} ${user.personalInfo.lastName || ''}`.trim()
      : user.username;
    
    // FIX: Convert actionType to past tense and format correctly
    // CREATE -> CREATED, UPDATE -> UPDATED, DELETE -> DELETED
    const actionTypePastTense = actionType === 'CREATE' ? 'CREATED' 
      : actionType === 'UPDATE' ? 'UPDATED'
      : actionType === 'DELETE' ? 'DELETED'
      : actionType === 'APPROVE' ? 'APPROVED'
      : actionType === 'REJECT' ? 'REJECTED'
      : actionType;
    
    // Build notification type: CONTRACT_CREATED, USER_UPDATED, etc.
    const notificationType = `${entityType.toUpperCase()}_${actionTypePastTense}`;
    
    // Format title and message based on action type
    let notificationTitle = '';
    let notificationMessage = '';
    
    switch (actionType) {
      case 'CREATE':
        notificationTitle = `New ${entityType} Created`;
        notificationMessage = `${userName} created a new ${entityType.toLowerCase()}: ${entityName}`;
        break;
      case 'UPDATE':
        notificationTitle = `${entityType} Updated`;
        notificationMessage = `${userName} updated ${entityType.toLowerCase()}: ${entityName}`;
        break;
      case 'DELETE':
        notificationTitle = `${entityType} Deleted`;
        notificationMessage = `${userName} deleted ${entityType.toLowerCase()}: ${entityName}`;
        break;
      case 'APPROVE':
        notificationTitle = `${entityType} Approved`;
        notificationMessage = `${userName} approved ${entityType.toLowerCase()}: ${entityName}`;
        break;
      case 'REJECT':
        notificationTitle = `${entityType} Rejected`;
        notificationMessage = `${userName} rejected ${entityType.toLowerCase()}: ${entityName}`;
        break;
      default:
        notificationTitle = `${entityType} Action`;
        notificationMessage = `${userName} performed an action on ${entityType.toLowerCase()}: ${entityName}`;
    }
    
    // Validate notification type before creating
    const validTypes = [
      'POSITION_NEEDS_CLAUSES',
      'USER_CREATED', 'USER_UPDATED', 'USER_DELETED',
      'POSITION_CREATED', 'POSITION_UPDATED', 'POSITION_DELETED',
      'CONTRACT_CREATED', 'CONTRACT_UPDATED', 'CONTRACT_DELETED',
      'CHARGING_NEEDED',
      'SALARY_GRADE_CREATED', 'SALARY_GRADE_UPDATED',
      'CLAUSE_CREATED', 'CLAUSE_UPDATED', 'CLAUSE_DELETED',
      'HOLIDAY_CREATED', 'HOLIDAY_UPDATED', 'HOLIDAY_DELETED'
    ];
    
    if (!validTypes.includes(notificationType)) {
      console.warn(`⚠️ Invalid notification type: ${notificationType}. Skipping notification creation.`);
      return;
    }
    
    const notifications = admins.map(admin => ({
      userId: admin._id,
      type: notificationType,
      title: notificationTitle,
      message: notificationMessage,
      relatedId: entityId,
      relatedModel: entityType,
      actionBy: {
        userId: performedBy,
        username: user.username,
        role: user.role,
        placeOfAssignment: user.placeOfAssignment
      }
    }));
    
    await Notification.insertMany(notifications);
    
    console.log(`✓ Activity logged: ${actionType} ${entityType} by ${user.username}`);
    console.log(`✓ Created ${notifications.length} notifications (type: ${notificationType})`);
  } catch (error) {
    console.error('❌ Error logging activity:', error);
    // Don't throw - logging failures shouldn't break main operations
  }
};