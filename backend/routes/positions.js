import mongoose from 'mongoose';
import express from 'express';
import Position from '../models/Position.js';
import SalaryGrade from '../models/SalaryGrade.js';
import Clause from '../models/Clause.js';
import ClauseGroup from '../models/ClauseGroup.js';
import User from '../models/User.js';
import { verifyToken } from './auth.js';
import Notification from '../models/Notification.js';
import { logActivity } from '../utils/activityLogger.js';

const router = express.Router();

// ⚠️ IMPORTANT: Specific routes MUST come BEFORE dynamic routes like /:id

// Salary Grades Routes (specific paths first)
router.get('/salary-grades/all', verifyToken, async (req, res) => { 
  try {
    const salaryGrades = await SalaryGrade.find().lean();
    
    // Sort numerically by grade
    salaryGrades.sort((a, b) => {
      const gradeA = parseFloat(a.grade);
      const gradeB = parseFloat(b.grade);
      return gradeA - gradeB;
    });
    
    res.json(salaryGrades);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get salary grade by grade value (e.g., "10", "6.5")
router.get('/salary-grades/:grade', verifyToken, async (req, res) => {
  try {
    const gradeParam = req.params.grade;
    
    // Try to find by string first, then by number
    let salaryGrade = await SalaryGrade.findOne({ grade: gradeParam });
    
    // If not found and the param is a valid number, try as number
    if (!salaryGrade && !isNaN(gradeParam)) {
      salaryGrade = await SalaryGrade.findOne({ grade: parseFloat(gradeParam) });
    }
    
    if (!salaryGrade) {
      return res.status(404).json({ message: `Salary grade ${gradeParam} not found` });
    }
    
    res.json(salaryGrade);
  } catch (error) {
    console.error('Error fetching salary grade:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/salary-grades', verifyToken, async (req, res) => {
  try {
    const newSalaryGrade = new SalaryGrade(req.body);
    await newSalaryGrade.save();
    res.status(201).json(newSalaryGrade);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/salary-grades/:id', verifyToken, async (req, res) => {
  try {
    const salaryGrade = await SalaryGrade.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    res.json(salaryGrade);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/salary-grades/:id', verifyToken, async (req, res) => {
  try {
    // Check if any positions are using this salary grade
    const positionsUsingGrade = await Position.find({ 
      salaryGrade: (await SalaryGrade.findById(req.params.id)).grade 
    });
    
    if (positionsUsingGrade.length > 0) {
      return res.status(400).json({ 
        message: `Cannot delete salary grade. It is currently used by ${positionsUsingGrade.length} position(s).`,
        positions: positionsUsingGrade.map(p => p.title)
      });
    }
    
    const salaryGrade = await SalaryGrade.findByIdAndDelete(req.params.id);
    
    if (!salaryGrade) {
      return res.status(404).json({ message: 'Salary grade not found' });
    }
    
    res.json({ message: 'Salary grade deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Clauses Routes
router.get('/clauses/all', verifyToken, async (req, res) => {
  try {
    const clauses = await Clause.find().sort({ clauseNumber: 1 });
    res.json(clauses);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/clauses', verifyToken, async (req, res) => {
  try {
    const newClause = new Clause(req.body);
    await newClause.save();
    res.status(201).json(newClause);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/clauses/:id', verifyToken, async (req, res) => {
  try {
    const clause = await Clause.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    res.json(clause);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/clauses/:id', verifyToken, async (req, res) => {
  try {
    const clause = await Clause.findByIdAndDelete(req.params.id);
    if (!clause) {
      return res.status(404).json({ message: 'Clause not found' });
    }
    res.json({ message: 'Clause deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Clause Groups Routes (specific path /clause-groups)
router.get('/clause-groups', verifyToken, async (req, res) => {
  try {
    console.log('✅ GET /clause-groups - START');
    console.log('User ID:', req.user.userId);

    // Fetch all groups and populate clauses directly
    const groups = await ClauseGroup.find()
      .populate({
        path: 'clauses',
        select: 'clauseNumber title content clauseType'
      })
      .populate({
        path: 'createdBy',
        select: 'username'
      })
      .sort({ name: 1 })
      .lean();

    console.log('Found groups:', groups.length);

    // Transform the data to match frontend expectations
    const result = groups.map(group => ({
      _id: group._id,
      name: group.name,
      description: group.description || '',
      clauses: group.clauses || [],
      createdBy: group.createdBy || { username: 'Unknown' },
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    }));

    console.log('SUCCESS: Sending', result.length, 'groups');
    res.json(result);
  } catch (error) {
    console.error('❌ FATAL ERROR in /clause-groups:');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error fetching clause groups', 
      error: error.message 
    });
  }
});

router.get('/clause-groups/:id', verifyToken, async (req, res) => {
  try {
    const group = await ClauseGroup.findById(req.params.id)
      .populate('clauses');
    
    if (!group) {
      return res.status(404).json({ message: 'Clause group not found' });
    }
    
    res.json(group);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/clause-groups', verifyToken, async (req, res) => {
  try {
    const { name, description, clauses } = req.body;
    
    const newGroup = new ClauseGroup({
      name,
      description,
      clauses,
      createdBy: req.user.userId
    });
    
    await newGroup.save();
    await newGroup.populate('clauses');
    
    res.status(201).json(newGroup);
  } catch (error) {
    console.error('Error creating clause group:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/clause-groups/:id', verifyToken, async (req, res) => {
  try {
    const { name, description, clauses } = req.body;
    
    const group = await ClauseGroup.findByIdAndUpdate(
      req.params.id,
      { 
        name, 
        description, 
        clauses,
        updatedAt: new Date() 
      },
      { new: true }
    ).populate('clauses');
    
    if (!group) {
      return res.status(404).json({ message: 'Clause group not found' });
    }
    
    res.json(group);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/clause-groups/:id', verifyToken, async (req, res) => {
  try {
    const group = await ClauseGroup.findByIdAndDelete(req.params.id);
    
    if (!group) {
      return res.status(404).json({ message: 'Clause group not found' });
    }
    
    res.json({ message: 'Clause group deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ⚠️ Position routes with dynamic :id - MUST BE LAST
router.get('/', verifyToken, async (req, res) => {
  try {
    let query = {};
    
    // Focal persons can only see positions for their place of assignment
    if (req.user.role === 'FOCAL_PERSON') {
      const user = await User.findById(req.user.userId);
      query.placeOfAssignment = user.placeOfAssignment;
    }
    
    const positions = await Position.find(query)
      .populate('assignedClauses')
      .populate('createdBy', 'username');
    res.json(positions);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// This /:id route catches ANY path that doesn't match routes above
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const position = await Position.findById(req.params.id)
      .populate('assignedClauses');
    
    if (!position) {
      return res.status(404).json({ message: 'Position not found' });
    }
    
    res.json(position);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      title,
      description,
      salaryGrade,
      isSpecialSalaryGrade,
      specialSalaryAmount,
      dutiesAndResponsibilities,
      assignedClauses,
      clauseGroups,
      placeOfAssignment,
      charging,
      premium
    } = req.body;
    
    // For focal persons, force their place of assignment
    let finalPlaceOfAssignment = placeOfAssignment;
    if (req.user.role === 'FOCAL_PERSON') {
      const currentUser = await User.findById(req.user.userId);
      finalPlaceOfAssignment = currentUser.placeOfAssignment;
    }
    
    // Generate position code automatically
    const positionCode = await generatePositionCode(finalPlaceOfAssignment, title);
    
    // Get current user for notifications
    const currentUser = await User.findById(req.user.userId);
    
    // Only admins can assign clauses
    let finalClauses = [];
    if (req.user.role === 'ADMINISTRATOR') {
      finalClauses = [...(assignedClauses || [])];
      
      // If clause groups are provided, add all their clauses
      if (clauseGroups && clauseGroups.length > 0) {
        const groups = await ClauseGroup.find({ _id: { $in: clauseGroups } });
        groups.forEach(group => {
          group.clauses.forEach(clauseId => {
            if (!finalClauses.includes(clauseId.toString())) {
              finalClauses.push(clauseId);
            }
          });
        });
      }
    }
    
    const newPosition = new Position({
      positionCode,
      title,
      description,
      salaryGrade,
      isSpecialSalaryGrade,
      specialSalaryAmount: specialSalaryAmount ? parseFloat(specialSalaryAmount) : undefined, // ← ADD THIS PARSE
      dutiesAndResponsibilities,
      assignedClauses: finalClauses,
      placeOfAssignment: finalPlaceOfAssignment, // Use the forced assignment for focal persons
      charging,
      premium,
      createdBy: req.user.userId,
      needsClauseAssignment: req.user.role !== 'ADMINISTRATOR' && finalClauses.length === 0
    });
    
    await newPosition.save();

    // Log the activity
    await logActivity({
      actionType: 'CREATE',
      entityType: 'Position',
      entityId: newPosition._id,
      entityName: `${title} (${positionCode})`,
      performedBy: req.user.userId,
      changesAfter: {
        positionCode,
        title,
        salaryGrade,
        placeOfAssignment: finalPlaceOfAssignment
      },
      req
    });
    
    // Notify admins if position needs clause assignment
    if (req.user.role === 'FOCAL_PERSON' && finalClauses.length === 0) {
      const admins = await User.find({ role: 'ADMINISTRATOR' });
      const notifications = admins.map(admin => ({
        userId: admin._id,
        type: 'POSITION_NEEDS_CLAUSES',
        title: 'New Position Needs Clause Assignment',
        message: `Position "${title}" (${positionCode}) at ${finalPlaceOfAssignment} created by ${currentUser.personalInfo?.firstName || currentUser.username} needs clause assignment`,
        relatedId: newPosition._id,
        relatedModel: 'Position',
        actionBy: {
          userId: req.user.userId,
          username: currentUser.username,
          role: currentUser.role,
          placeOfAssignment: currentUser.placeOfAssignment
        }
      }));
      
      await Notification.insertMany(notifications);
      console.log(`✓ Notified ${admins.length} admins about new position`);
    }
    
    // Notify finance officers and admins if charging is empty
    if (!charging || charging.trim() === '') {
      const financeAndAdmins = await User.find({ 
        role: { $in: ['FINANCE_OFFICER', 'ADMINISTRATOR'] } 
      });
      
      const chargingNotifications = financeAndAdmins.map(user => ({
        userId: user._id,
        type: 'CHARGING_NEEDED',
        title: 'Charging Required for New Position',
        message: `Position "${title}" (${positionCode}) at ${finalPlaceOfAssignment} created by ${currentUser.personalInfo?.firstName || currentUser.username} needs charging information`,
        relatedId: newPosition._id,
        relatedModel: 'Position',
        actionBy: {
          userId: req.user.userId,
          username: currentUser.username,
          role: currentUser.role,
          placeOfAssignment: currentUser.placeOfAssignment
        }
      }));
      
      await Notification.insertMany(chargingNotifications);
      console.log(`✓ Notified ${financeAndAdmins.length} finance/admins about charging needed`);
    }
    
    res.status(201).json(newPosition);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', verifyToken, async (req, res) => {
  try {
    // Fetch the existing position first
    const existingPosition = await Position.findById(req.params.id);
    if (!existingPosition) {
      return res.status(404).json({ message: 'Position not found' });
    }
    
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };

    // Parse specialSalaryAmount if it exists
    if (updateData.specialSalaryAmount) {
      updateData.specialSalaryAmount = parseFloat(updateData.specialSalaryAmount);
    }
    
    // Preserve placeOfAssignment if admin is only updating clauses
    if (req.user.role === 'ADMINISTRATOR' && !req.body.placeOfAssignment) {
      updateData.placeOfAssignment = existingPosition.placeOfAssignment;
    }
    
    // Only admins can modify clause assignments
    if (req.user.role === 'ADMINISTRATOR') {
      // Handle clause groups if provided
      if (req.body.clauseGroups && req.body.clauseGroups.length > 0) {
        const groups = await ClauseGroup.find({ _id: { $in: req.body.clauseGroups } });
        let allClauses = [...(req.body.assignedClauses || [])];
        
        groups.forEach(group => {
          group.clauses.forEach(clauseId => {
            if (!allClauses.includes(clauseId.toString())) {
              allClauses.push(clauseId);
            }
          });
        });
        
        updateData.assignedClauses = allClauses;
        updateData.needsClauseAssignment = allClauses.length === 0;
      }
    } else {
      // Non-admins cannot modify clause assignments
      delete updateData.assignedClauses;
      delete updateData.clauseGroups;
    }
    
    const position = await Position.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('assignedClauses');
    
    if (!position) {
      return res.status(404).json({ message: 'Position not found' });
    }
    
    res.json(position);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const position = await Position.findByIdAndDelete(req.params.id);
    
    if (!position) {
      return res.status(404).json({ message: 'Position not found' });
    }
    
    res.json({ message: 'Position deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Helper function to generate position code
const generatePositionCode = async (placeOfAssignment, title) => {
  // Extract abbreviation from place of assignment (first letters of each word)
  const assignmentWords = placeOfAssignment.split(' ').filter(word => 
    // Filter out common words like "AND", "OF", "THE"
    !['AND', 'OF', 'THE', 'FOR', 'IN', 'AT'].includes(word.toUpperCase())
  );
  
  const assignmentAbbr = assignmentWords
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .substring(0, 5); // Increased to 5 characters for longer names
  
  // Extract abbreviation from position title
  const titleWords = title.split(' ').filter(word => 
    // Filter out common words and numbers
    !['AND', 'OF', 'THE', 'FOR', 'IN', 'AT'].includes(word.toUpperCase()) &&
    isNaN(word) // Exclude standalone numbers
  );
  
  let titleAbbr = '';
  
  if (titleWords.length === 1) {
    // Single word: take first 4 characters
    titleAbbr = titleWords[0].substring(0, 4).toUpperCase();
  } else {
    // Multiple words: take first letter or first two letters of each significant word
    titleAbbr = titleWords
      .map((word, index) => {
        // For important words (first 2-3), take up to 2 letters
        if (index < 2) {
          return word.substring(0, 2).toUpperCase();
        }
        return word[0].toUpperCase();
      })
      .join('')
      .substring(0, 4); // Limit to 4 characters
  }
  
  // Handle Roman numerals in title (e.g., "Officer I", "Officer II")
  const romanNumeralMatch = title.match(/\b([IVX]+)\b$/i);
  if (romanNumeralMatch) {
    titleAbbr += romanNumeralMatch[1].toUpperCase();
  }
  
  // Find existing positions with similar codes to determine instance number
  const existingPositions = await Position.find({
    positionCode: new RegExp(`^${assignmentAbbr}-${titleAbbr}`, 'i')
  }).sort({ positionCode: -1 });
  
  let instance = 1;
  if (existingPositions.length > 0) {
    // Extract the highest instance number
    const lastCode = existingPositions[0].positionCode;
    const match = lastCode.match(/-(\d+)$/);
    if (match) {
      instance = parseInt(match[1]) + 1;
    }
  }
  
  return `${assignmentAbbr}-${titleAbbr}-${instance}`;
};

export default router;