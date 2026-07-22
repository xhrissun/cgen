import express from 'express';
import { errDetail } from '../utils/errors.js';
import bcrypt from 'bcryptjs';
import { documentUpload, profilePhotoUpload } from '../utils/r2Upload.js';
import { deleteFromR2 } from '../utils/r2Delete.js';
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from '../config/r2.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
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
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Get user by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    // Authorization: a user may view their own record. Admins and finance
    // officers may view anyone. Focal persons may only view users assigned
    // to their own place of assignment. Everyone else is denied (this closes
    // the IDOR that let any authenticated user pull any other user's PII).
    const isSelf = req.user.userId === req.params.id;
    const isAdmin = req.user.role === 'ADMINISTRATOR';
    const isFinance = req.user.role === 'FINANCE_OFFICER';

    if (!isSelf && !isAdmin && !isFinance) {
      if (req.user.role === 'FOCAL_PERSON') {
        const requester = await User.findById(req.user.userId).select('placeOfAssignment');
        const target = await User.findById(req.params.id).select('placeOfAssignment');
        if (!target) {
          return res.status(404).json({ message: 'User not found' });
        }
        if (!requester || target.placeOfAssignment !== requester.placeOfAssignment) {
          return res.status(403).json({ message: 'Access denied' });
        }
      } else {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
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
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Update user
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { username, role, personalInfo, placeOfAssignment, status } = req.body;

    // Only admins can change role or username
    const isAdmin = req.user.role === 'ADMINISTRATOR';
    const isFocalPerson = req.user.role === 'FOCAL_PERSON';

    // Role changes: admin only
    if (role && !isAdmin) {
      return res.status(403).json({ message: 'Access denied. Only administrators can change user roles.' });
    }

    // Focal persons cannot assign non-CONTRACTUAL roles
    if (role && isFocalPerson && role !== 'CONTRACTUAL') {
      return res.status(403).json({ message: 'Focal persons can only assign Contractual role.' });
    }

    // Username changes: admin only
    if (username && !isAdmin) {
      return res.status(403).json({ message: 'Access denied. Only administrators can change usernames.' });
    }

    // If username is being changed, check uniqueness (exclude current user)
    if (username) {
      const existingUser = await User.findOne({ username, _id: { $ne: req.params.id } });
      if (existingUser) {
        return res.status(400).json({ message: 'Username already taken. Please choose a different username.' });
      }
    }

    // Fetch old user state for audit log
    const oldUser = await User.findById(req.params.id).select('-password');
    if (!oldUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updateData = {
      updatedAt: new Date()
    };

    if (personalInfo) updateData.personalInfo = personalInfo;
    if (placeOfAssignment) updateData.placeOfAssignment = placeOfAssignment;

    // Allow both ADMIN and FOCAL_PERSON to change status
    if (status && (isAdmin || isFocalPerson)) {
      updateData.status = status;
    }

    // Role update — admin only; past contracts are NOT affected because
    // contracts store their own snapshot of position/signatory data at generation time.
    if (role && isAdmin) {
      updateData.role = role;
    }

    // Username update — admin only; past contracts reference userId (ObjectId),
    // not the username string, so existing contracts remain unaffected.
    if (username && isAdmin) {
      updateData.username = username;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Build audit log changes
    const changesBefore = {};
    const changesAfter = {};
    if (role && role !== oldUser.role) {
      changesBefore.role = oldUser.role;
      changesAfter.role = role;
    }
    if (username && username !== oldUser.username) {
      changesBefore.username = oldUser.username;
      changesAfter.username = username;
    }
    if (status && status !== oldUser.status) {
      changesBefore.status = oldUser.status;
      changesAfter.status = status;
    }
    if (placeOfAssignment && placeOfAssignment !== oldUser.placeOfAssignment) {
      changesBefore.placeOfAssignment = oldUser.placeOfAssignment;
      changesAfter.placeOfAssignment = placeOfAssignment;
    }

    await logActivity({
      actionType: 'UPDATE',
      entityType: 'User',
      entityId: user._id,
      entityName: `${user.username} (${user.role})`,
      performedBy: req.user.userId,
      changesBefore: Object.keys(changesBefore).length ? changesBefore : undefined,
      changesAfter: Object.keys(changesAfter).length ? changesAfter : undefined,
      req
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
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
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
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
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Authenticated photo proxy — streams any R2 object through the backend.
// Use this when the R2 bucket is NOT configured for public access, or when
// VITE_R2_PUBLIC_URL is missing. The frontend calls /api/users/:id/photo/:key
// and the backend fetches from R2 with credentials, then pipes the response.
router.get('/:id/photo/*', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('placeOfAssignment');
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Access control: own profile, admin, or same-assignment focal person
    const canView =
      req.user.userId === req.params.id ||
      req.user.role === 'ADMINISTRATOR' ||
      req.user.role === 'FOCAL_PERSON' ||
      req.user.role === 'FINANCE_OFFICER';

    if (!canView) return res.status(403).json({ message: 'Access denied' });

    // The key is everything after /photo/
    const key = req.params[0];
    if (!key) return res.status(400).json({ message: 'Missing file key' });

    const command = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
    const r2Response = await r2Client.send(command);

    // Forward content type and length
    if (r2Response.ContentType) res.setHeader('Content-Type', r2Response.ContentType);
    if (r2Response.ContentLength) res.setHeader('Content-Length', r2Response.ContentLength);

    // Cache for 1 hour in browser — photos don't change often
    res.setHeader('Cache-Control', 'private, max-age=3600');

    // Stream R2 body directly to client
    r2Response.Body.pipe(res);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ message: 'Photo not found' });
    }
    console.error('R2 photo proxy error:', err.message);
    res.status(500).json({ message: 'Failed to load photo' });
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

    const fileKey = req.file.key;  // R2 object key — always safe to store

    // Build a publicly accessible URL.
    // file.location from multer-s3 is the PRIVATE r2.cloudflarestorage.com endpoint —
    // browsers cannot access it. Use R2_PUBLIC_URL (custom domain or pub-*.r2.dev)
    // when available; otherwise store only the key so the backend proxy serves it.
    const fileUrl = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL}/${fileKey}`
      : fileKey;  // key-only: getDocumentUrl() will proxy via /api/users/:id/photo/:key

    // Handle profile photo
    if (isProfilePhoto === 'true') {
      // Delete old profile photo from R2 if exists
      const oldDoc = user.documents.find(doc => doc.filename === user.personalInfo.profilePhoto)
                  || user.documents.find(doc => doc.key === user.personalInfo.profilePhoto);
      if (oldDoc?.key) await deleteFromR2(oldDoc.key);
      user.documents = user.documents.filter(doc =>
        doc.filename !== user.personalInfo.profilePhoto &&
        doc.key !== user.personalInfo.profilePhoto
      );
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
      filename: fileUrl,  // public URL or key (never the private cloudflarestorage.com URL)
      key: fileKey,
      url: fileUrl,
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
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Get/Download document — stream directly from R2 using our private API
// credentials (same approach as the /:id/photo/* proxy below). We used to
// redirect to a public R2 URL here, which meant every document (contracts,
// signed files, EODB ID PDFs, legacy flat-name uploads) silently depended on
// the bucket's "Public Development URL" being enabled. If that's ever turned
// off, a stored `document.url` pointing at pub-xxxx.r2.dev becomes a dead
// link and this route 404s. Deriving the key and fetching it privately means
// it keeps working (old records included) no matter what the bucket's public
// access setting is.
// Use wildcard to capture filenames that contain slashes (R2 keys with subfolders)
router.get('/:id/documents/*', verifyToken, async (req, res) => {
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

    // Capture the full path after /documents/ — may include subfolder
    const rawParam = req.params[0]; // e.g. "profile-photos/profile-xxx.jpg" or just "profile-xxx.jpg"

    // Strategy 1: find by exact key match
    let document = user.documents.find(doc => doc.key === rawParam);

    // Strategy 2: find by filename ending match
    if (!document) {
      document = user.documents.find(doc =>
        doc.filename === rawParam ||
        doc.filename?.endsWith(rawParam) ||
        doc.key?.endsWith(rawParam)
      );
    }

    // Strategy 3: find by base filename only (last path segment)
    const baseFilename = rawParam.split('/').pop();
    if (!document) {
      document = user.documents.find(doc =>
        doc.filename?.endsWith(baseFilename) ||
        doc.key?.endsWith(baseFilename)
      );
    }

    // Pull the R2 object key out of whatever we have on record. Old rows may
    // only have a full public URL (document.url / document.filename); newer
    // rows have `key` directly. Either way we end up with a bare key and
    // fetch it ourselves with our private credentials — never redirect to a
    // public R2 URL.
    const keyFromUrl = (value) => {
      if (!value || !value.startsWith('http')) return null;
      try {
        return new URL(value).pathname.replace(/^\//, '');
      } catch (_) {
        return null;
      }
    };

    const objectKey =
      document?.key ||
      keyFromUrl(document?.url) ||
      keyFromUrl(document?.filename) ||
      (document && !document.filename?.startsWith('http') ? document.filename : null) ||
      (!rawParam.startsWith('http') ? rawParam : keyFromUrl(rawParam));

    if (!objectKey) {
      return res.status(404).json({ message: 'Document not found' });
    }

    try {
      const command = new GetObjectCommand({ Bucket: R2_BUCKET, Key: objectKey });
      const r2Response = await r2Client.send(command);

      if (r2Response.ContentType) res.setHeader('Content-Type', r2Response.ContentType);
      if (r2Response.ContentLength) res.setHeader('Content-Length', r2Response.ContentLength);
      res.setHeader('Cache-Control', 'private, max-age=3600');

      r2Response.Body.pipe(res);
    } catch (err) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ message: 'Document not found in storage' });
      }
      throw err;
    }

  } catch (error) {
    console.error('Error serving document:', error);
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Delete document
router.delete('/:id/documents/*', verifyToken, async (req, res) => {
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

    const rawParam = req.params[0];
    const baseFilename = rawParam.split('/').pop();

    const docIndex = user.documents.findIndex(
      doc => doc.key === rawParam ||
             doc.filename === rawParam ||
             doc.filename?.endsWith(baseFilename) ||
             doc.key?.endsWith(baseFilename)
    );

    if (docIndex === -1) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const doc = user.documents[docIndex];
    user.documents.splice(docIndex, 1);
    await user.save();

    if (doc.key) {
      await deleteFromR2(doc.key).catch(err => console.warn('R2 delete warning:', err.message));
    }

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
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
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

export default router;