import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { verifyToken } from './auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Notification from '../models/Notification.js';
import { logActivity } from '../utils/activityLogger.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads/';
    // Make sure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Check if this is a profile photo
    const isProfilePhoto = req.body.isProfilePhoto === 'true';
    
    if (isProfilePhoto) {
      // For profile photos, create a consistent naming pattern
      const userId = req.params.id;
      const timestamp = Date.now();
      const ext = path.extname(file.originalname) || '.jpg';
      const filename = `profile-${userId}-${timestamp}${ext}`;
      console.log('Saving profile photo as:', filename);
      cb(null, filename);
    } else {
      // For regular documents, use timestamp + original name
      const filename = `${Date.now()}-${file.originalname}`;
      console.log('Saving document as:', filename);
      cb(null, filename);
    }
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

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

// Add this BEFORE the router.post upload route
const uploadMiddleware = upload.single('file');

// Replace the entire upload route with this:
router.post('/:id/documents', verifyToken, (req, res, next) => {
  // Custom middleware to ensure req.body is available for multer
  uploadMiddleware(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ message: 'File upload error', error: err.message });
    }
    
    // Continue to the main handler
    handleDocumentUpload(req, res);
  });
});

// Separate function to handle the upload logic
async function handleDocumentUpload(req, res) {
  try {
    const { type, description, isProfilePhoto, contractNumber } = req.body;
    const userId = req.params.id;
    
    console.log('=== Document Upload Handler ===');
    console.log('User ID:', userId);
    console.log('Type:', type);
    console.log('isProfilePhoto:', isProfilePhoto);
    console.log('contractNumber:', contractNumber);
    console.log('Uploaded file:', req.file.filename);
    console.log('File path:', req.file.path);
    
    const user = await User.findById(userId);
    if (!user) {
      // Delete the uploaded file since user doesn't exist
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Initialize personalInfo if it doesn't exist
    if (!user.personalInfo) {
      user.personalInfo = {};
    }
    
    let finalFilename = req.file.filename;
    
    // If this is a profile photo, rename the file to include userId
    if (isProfilePhoto === 'true') {
      const oldPath = req.file.path;
      const ext = path.extname(req.file.filename);
      const newFilename = `profile-${userId}-${Date.now()}${ext}`;
      const newPath = path.join(path.dirname(oldPath), newFilename);
      
      console.log('Renaming profile photo:');
      console.log('  From:', oldPath);
      console.log('  To:', newPath);
      
      // Rename the file
      fs.renameSync(oldPath, newPath);
      finalFilename = newFilename;
      
      // Remove old profile photo
      const oldProfilePhoto = user.personalInfo.profilePhoto;
      if (oldProfilePhoto && oldProfilePhoto !== newFilename) {
        // Remove from documents array
        user.documents = user.documents.filter(doc => doc.filename !== oldProfilePhoto);
        
        // Delete old file from filesystem
        const oldFilePath = path.join(process.cwd(), 'uploads', oldProfilePhoto);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
          console.log('Deleted old profile photo:', oldProfilePhoto);
        }
      }
      
      // Set new profile photo
      user.personalInfo.profilePhoto = finalFilename;
      console.log('Set profilePhoto to:', finalFilename);
    }
    
    // ✅ ADD THIS: Handle PASSPORT_PHOTO overwrite
    if (type === 'PASSPORT_PHOTO') {
      // Find and remove old passport photo
      const oldPassportPhoto = user.documents.find(doc => doc.type === 'PASSPORT_PHOTO');
      if (oldPassportPhoto) {
        // Remove from documents array
        user.documents = user.documents.filter(doc => doc.type !== 'PASSPORT_PHOTO');
        
        // Delete old file from filesystem
        const oldFilePath = path.join(process.cwd(), 'uploads', oldPassportPhoto.filename);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
          console.log('Deleted old passport photo:', oldPassportPhoto.filename);
        }
      }
    }
    
    // Always add to documents array (including profile photos)
    user.documents.push({
      type: type || 'PHOTO',
      filename: finalFilename,
      description: description || (isProfilePhoto === 'true' ? 'Profile Photo' : ''),
      contractNumber: contractNumber || undefined
    });
    
    // Mark personalInfo as modified to ensure it saves
    user.markModified('personalInfo');
    user.updatedAt = new Date();
    await user.save();
    
    console.log('=== Upload Complete ===');
    console.log('Final filename:', finalFilename);
    console.log('Profile photo in DB:', user.personalInfo?.profilePhoto);
    console.log('Documents count:', user.documents.length);
    
    res.json({ 
      message: 'Document uploaded successfully', 
      documents: user.documents,
      personalInfo: user.personalInfo
    });
  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// Get/Download document
// Get/Download document
router.get('/:id/documents/:filename', verifyToken, async (req, res) => {
  try {
    console.log('Document request:', {
      userId: req.params.id,
      filename: req.params.filename,
      user: req.user
    });

    const user = await User.findById(req.params.id);
    if (!user) {
      console.log('User not found:', req.params.id);
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user has permission to view documents
    const canView = 
      req.user.userId === req.params.id || // Own documents
      req.user.role === 'ADMINISTRATOR' || // Admin can view all
      (req.user.role === 'FOCAL_PERSON' && user.placeOfAssignment === req.user.placeOfAssignment); // Focal can view their assignment

    if (!canView) {
      console.log('Access denied for user:', req.user.userId);
      return res.status(403).json({ message: 'Access denied' });
    }

    const document = user.documents.find(doc => doc.filename === req.params.filename);
    if (!document) {
      console.log('Document not found in user.documents:', req.params.filename);
      console.log('Available documents:', user.documents.map(d => d.filename));
      return res.status(404).json({ message: 'Document not found in database' });
    }

    const filePath = path.join(process.cwd(), 'uploads', req.params.filename);
    
    console.log('Looking for file at:', filePath);
    console.log('File exists:', fs.existsSync(filePath));

    if (!fs.existsSync(filePath)) {
      console.log('File not found on filesystem:', filePath);
      // List files in uploads directory for debugging
      const uploadFiles = fs.readdirSync(path.join(process.cwd(), 'uploads'));
      console.log('Files in uploads directory:', uploadFiles);
      return res.status(404).json({ message: 'File not found on server' });
    }

    // Get file extension and set proper content type
    const ext = req.params.filename.split('.').pop().toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (ext === 'pdf') contentType = 'application/pdf';
    else if (['jpg', 'jpeg'].includes(ext)) contentType = 'image/jpeg';
    else if (ext === 'png') contentType = 'image/png';
    else if (ext === 'gif') contentType = 'image/gif';
    else if (ext === 'doc') contentType = 'application/msword';
    else if (ext === 'docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${req.params.filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    console.log('Sending file:', filePath);
    res.sendFile(filePath);
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

    // Check if user has permission to delete documents
    const canDelete = 
      req.user.userId === req.params.id || // Own documents
      req.user.role === 'ADMINISTRATOR'; // Admin can delete

    if (!canDelete) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const docIndex = user.documents.findIndex(doc => doc.filename === req.params.filename);
    if (docIndex === -1) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const filename = user.documents[docIndex].filename;
    user.documents.splice(docIndex, 1);
    await user.save();

    // Delete file from filesystem
    const filePath = path.join(process.cwd(), 'uploads', filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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