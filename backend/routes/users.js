import express from 'express';
import bcrypt from 'bcryptjs';
import { documentUpload, profilePhotoUpload } from '../utils/r2Upload.js';
import { deleteFromR2 } from '../utils/r2Delete.js';
import { R2_PUBLIC_URL } from '../config/r2.js';
import User from '../models/User.js';
import { verifyToken } from './auth.js';
import path from 'path';
import Notification from '../models/Notification.js';
import { logActivity } from '../utils/activityLogger.js';

const router = express.Router();

// Get all users (Admin/Focal Person)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { role, placeOfAssignment } = req.query;
    let query = {};
    
    // Focal persons can only see users in their place of assignment
    if (req.user.role === 'FOCAL_PERSON') {
      const currentUser = await User.findById(req.user.userId);
      query.placeOfAssignment = currentUser.placeOfAssignment;
      query.role = { $in: ['CONTRACTUAL', 'FOCAL_PERSON'] };
    }

    
    if (role) query.role = role;
    if (placeOfAssignment && req.user.role === 'ADMINISTRATOR') {
      query.placeOfAssignment = placeOfAssignment;
    }
    
    const users = await User.find(query).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get user by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create user
router.post('/', verifyToken, async (req, res) => {
  try {
    const { username, role, placeOfAssignment, personalInfo, status } = req.body;  // ✅ ADD status here
    
    // Focal persons can only create contractual users
    if (req.user.role === 'FOCAL_PERSON' && role !== 'CONTRACTUAL') {
      return res.status(403).json({ message: 'Focal persons can only create contractual users' });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }
    
    // Determine default password
    let password = '123456'; // Default
    if (personalInfo?.tin && personalInfo.tin.trim()) {
      password = personalInfo.tin.trim();
    }
    
    // For focal persons creating users, lock place of assignment
    let finalPlaceOfAssignment = placeOfAssignment;
    if (req.user.role === 'FOCAL_PERSON') {
      const currentUser = await User.findById(req.user.userId);
      finalPlaceOfAssignment = currentUser.placeOfAssignment;
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = new User({
      username,
      password: hashedPassword,
      role,
      status: status || 'ACTIVE',  // ✅ Use provided status or default to ACTIVE
      placeOfAssignment: finalPlaceOfAssignment,
      personalInfo,
      createdBy: req.user.userId
    });
    
    await newUser.save();

    // Log the activity
    await logActivity({
      actionType: 'CREATE',
      entityType: 'User',
      entityId: newUser._id,
      entityName: `${username} (${role})`,
      performedBy: req.user.userId,
      changesAfter: {
        username,
        role,
        placeOfAssignment: finalPlaceOfAssignment
      },
      req
    });
    
    // Create notification for admins
    const currentUser = await User.findById(req.user.userId);
    const admins = await User.find({ role: 'ADMINISTRATOR' });
    
    const notifications = admins.map(admin => ({
      userId: admin._id,
      type: 'USER_CREATED',
      title: 'New User Created',
      message: `${currentUser.personalInfo?.firstName || currentUser.username} created user: ${username} (${role}) - ${finalPlaceOfAssignment || 'No assignment'}`,
      relatedId: newUser._id,
      relatedModel: 'User',
      actionBy: {
        userId: req.user.userId,
        username: currentUser.username,
        role: currentUser.role,
        placeOfAssignment: currentUser.placeOfAssignment
      }
    }));
    
    await Notification.insertMany(notifications);
    
    const userResponse = newUser.toObject();
    delete userResponse.password;
    
    res.status(201).json(userResponse);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update user
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { personalInfo, placeOfAssignment, status } = req.body;
    
    const updateData = {
      updatedAt: new Date()
    };
    
    if (personalInfo) updateData.personalInfo = personalInfo;
    if (placeOfAssignment) updateData.placeOfAssignment = placeOfAssignment;
    
    // ✅ CHANGE THIS: Allow both ADMIN and FOCAL_PERSON to change status
    if (status && (req.user.role === 'ADMINISTRATOR' || req.user.role === 'FOCAL_PERSON')) {
      updateData.status = status;
    }
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Reset user password (Admin only)
router.post('/:id/reset-password', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ message: 'Access denied. Administrator only.' });
    }

    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.updatedAt = new Date();
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete user (Admin only)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Upload document / profile photo → R2
router.post('/:id/documents', verifyToken, documentUpload.single('file'), async (req, res) => {
  try {
    const { type, description, isProfilePhoto, contractNumber } = req.body;
    const userId = req.params.id;

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const user = await User.findById(userId);
    if (!user) {
      await deleteFromR2(req.file.key);
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.personalInfo) user.personalInfo = {};

    const fileUrl = req.file.location;  // Full R2 public URL
    const fileKey = req.file.key;       // R2 object key for deletion

    // Handle profile photo
    if (isProfilePhoto === 'true') {
      // Delete old profile photo from R2 if exists
      const oldDoc = user.documents.find(doc => doc.filename === user.personalInfo.profilePhoto);
      if (oldDoc?.key) await deleteFromR2(oldDoc.key);
      user.documents = user.documents.filter(doc => doc.filename !== user.personalInfo.profilePhoto);
      user.personalInfo.profilePhoto = fileUrl;
    }

    // Handle passport photo overwrite
    if (type === 'PASSPORT_PHOTO') {
      const oldPassport = user.documents.find(doc => doc.type === 'PASSPORT_PHOTO');
      if (oldPassport?.key) await deleteFromR2(oldPassport.key);
      user.documents = user.documents.filter(doc => doc.type !== 'PASSPORT_PHOTO');
    }

    user.documents.push({
      type: type || 'PHOTO',
      filename: fileUrl,
      key: fileKey,
      description: description || (isProfilePhoto === 'true' ? 'Profile Photo' : ''),
      contractNumber: contractNumber || undefined
    });

    user.markModified('personalInfo');
    user.updatedAt = new Date();
    await user.save();

    res.json({
      message: 'Document uploaded successfully',
      documents: user.documents,
      personalInfo: user.personalInfo
    });
  } catch (error) {
    console.error('Upload error:', error);
    if (req.file?.key) await deleteFromR2(req.file.key).catch(() => {});
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get/Download document — redirect to R2 public URL
// Get/Download document — redirect to R2 public URL
router.get('/:id/documents/:filename', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const canView =
      req.user.userId === req.params.id ||
      req.user.role === 'ADMINISTRATOR' ||
      (req.user.role === 'FOCAL_PERSON' && user.placeOfAssignment === req.user.placeOfAssignment);

    if (!canView) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // filename param may be the R2 key or the full URL stored in document.filename
    const document = user.documents.find(
      doc => doc.filename === req.params.filename ||
             doc.key === req.params.filename ||
             doc.filename?.endsWith(req.params.filename)
    );

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // If filename is already a full URL, redirect directly
    const fileUrl = document.filename?.startsWith('http')
      ? document.filename
      : `${R2_PUBLIC_URL}/${document.key || document.filename}`;

    res.redirect(fileUrl);
  } catch (error) {
    console.error('Error serving document:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete document
router.delete('/:id/documents/:filename', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const canDelete =
      req.user.userId === req.params.id ||
      req.user.role === 'ADMINISTRATOR';

    if (!canDelete) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const docKey = req.params.filename;
    const docIndex = user.documents.findIndex(
      doc => doc.filename === docKey ||
             doc.key === docKey ||
             doc.filename?.endsWith(docKey) ||
             doc.key?.endsWith(docKey)
    );
    if (docIndex === -1) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const doc = user.documents[docIndex];
    user.documents.splice(docIndex, 1);
    await user.save();

    // Delete from R2
    if (doc.key) {
      await deleteFromR2(doc.key).catch(err => console.warn('R2 delete warning:', err.message));
    }

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get user history
router.get('/:id/history', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('contractHistory.contractId')
      .select('contractHistory');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user.contractHistory);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;