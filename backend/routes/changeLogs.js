import express from 'express';
import ChangeLog from '../models/ChangeLog.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Get change logs (Admin only)
router.get('/', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { entityType, userId, limit = 100, skip = 0 } = req.query;
    
    let query = {};
    if (entityType) query.entityType = entityType;
    if (userId) query['performedBy.userId'] = userId;
    
    const logs = await ChangeLog.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('performedBy.userId', 'username personalInfo');
    
    const total = await ChangeLog.countDocuments(query);
    
    res.json({ logs, total });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get logs for specific entity
router.get('/entity/:entityType/:entityId', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const logs = await ChangeLog.find({
      entityType: req.params.entityType,
      entityId: req.params.entityId
    })
    .sort({ timestamp: -1 })
    .populate('performedBy.userId', 'username personalInfo');
    
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;