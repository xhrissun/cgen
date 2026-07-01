// eodb.js (updated)
import express from 'express';
import { errDetail } from '../utils/errors.js';
import User from '../models/User.js';
import Contract from '../models/Contract.js';
import { verifyToken } from './auth.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Some staff have typed a placeholder ("-", "N/A", "NONE", etc.) into the
// Middle Name field to get past an old required-field check, since a person
// can legitimately have no middle name. Treat any placeholder-only value the
// same as an empty middle name so it never becomes a stray middle initial.
const NO_MIDDLE_NAME_PATTERN = /^[\s\-._]*$|^(n\/?a\.?|none|no\s*middle\s*name)$/i;
const normalizeMiddleName = (value) => {
  const trimmed = String(value || '').trim();
  return NO_MIDDLE_NAME_PATTERN.test(trimmed) ? '' : trimmed;
};

// Model for Print Logs
import mongoose from 'mongoose';

const PrintLogSchema = new mongoose.Schema({
  tin: { type: String, required: true },
  employeeName: { type: String, required: true },
  serialNumber: { type: String, required: true, unique: true },
  printedBy: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  timestamp: { type: Date, required: true }
}, { collection: 'eodb_print_logs' });

const PrintLog = mongoose.model('EODBPrintLog', PrintLogSchema);

// Generate hash for serial number
const generateHash = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 7);
};

// Check if EODB ID already exists for current contract
router.get('/check-existing', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Parallel queries — neither depends on the other
    const [user, latestContract] = await Promise.all([
      User.findById(userId).select('documents').lean(),
      Contract.findOne({ userId }).sort({ contractNumber: -1 }).select('contractNumber').lean()
    ]);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!latestContract) {
      return res.json({ exists: false, contractNumber: null });
    }

    // Check if EODB_ID already exists for this contract
    const existingEODB = user.documents.find(
      doc => doc.type === 'EODB_ID' && doc.contractNumber === latestContract.contractNumber
    );

    res.json({
      exists: !!existingEODB,
      contractNumber: latestContract.contractNumber,
      eodbDocument: existingEODB || null
    });
  } catch (error) {
    console.error('Error checking existing EODB:', error);
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Get EODB data for current user
router.get('/user-data', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Parallel queries — neither depends on the other
    const [user, latestContract] = await Promise.all([
      User.findById(userId).select('-password').lean(),
      Contract.findOne({ userId }).sort({ contractNumber: -1 }).lean()
    ]);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }


    // Find PASSPORT photo from documents array (not profile photo)
    const passportPhoto = user.documents.find(
      doc => doc.type === 'PASSPORT_PHOTO' && !doc.deleted
    );

    // Photos are stored on R2 (remote), not local disk — just check the document record exists
    const photoExists = !!(passportPhoto?.filename || passportPhoto?.url || passportPhoto?.key);

    // Format TIN: Remove all non-digits and take first 9 digits
    const rawTin = user.personalInfo?.tin || '';
    const formattedTin = rawTin.replace(/\D/g, '').slice(0, 9);

    // Prepare EODB data
    const eodbData = {
      lastName: user.personalInfo?.lastName || '',
      firstName: user.personalInfo?.firstName || '',
      middleInitial: normalizeMiddleName(user.personalInfo?.middleInitial) || 
                     (normalizeMiddleName(user.personalInfo?.middleName) ? normalizeMiddleName(user.personalInfo.middleName).charAt(0) : ''),
      title: user.personalInfo?.suffix || '', // Using suffix as title field
      position: latestContract?.position ? `${latestContract.position} (COS)` : 'CONTRACTUAL (COS)',
      assignment: user.placeOfAssignment || latestContract?.placeOfAssignment || 'DENR IV-A',
      tin: formattedTin, // Already formatted to 9 digits
      photoExists: photoExists,
      photoFilename: passportPhoto?.filename || null,
      contractNumber: latestContract?.contractNumber || '',
      contractStart: latestContract?.startDate ? latestContract.startDate.toISOString().split('T')[0] : '',
      contractEnd: latestContract?.endDate ? latestContract.endDate.toISOString().split('T')[0] : ''
    };

    res.json(eodbData);
  } catch (error) {
    console.error('Error fetching EODB data:', error);
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Get profile photo for EODB
router.get('/photo/:filename', verifyToken, async (req, res) => {
  try {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    // Strip any directory components from the requested filename so a value
    // like "../../.env" or "..%2F..%2Fserver.js" can't escape the uploads
    // folder (path traversal).
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(uploadsDir, safeFilename);

    // Belt-and-suspenders: confirm the resolved path is still inside uploadsDir.
    if (!filePath.startsWith(uploadsDir + path.sep)) {
      return res.status(400).json({ message: 'Invalid filename' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Photo not found' });
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving photo:', error);
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Log print action
router.post('/log-print', verifyToken, async (req, res) => {
  try {
    const { tin, employeeName, serialNumber, printedBy, timestamp } = req.body;

    if (!tin || !employeeName || !serialNumber || !printedBy || !timestamp) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const logEntry = new PrintLog({
      tin,
      employeeName,
      serialNumber,
      printedBy,
      userId: req.user.userId,
      timestamp: new Date(timestamp)
    });

    await logEntry.save();
    res.status(200).json({ message: 'Print logged successfully' });
  } catch (error) {
    console.error('Error logging print:', error);
    if (error.code === 11000) {
      res.status(400).json({ error: 'Duplicate serial number' });
    } else {
      res.status(500).json({ error: 'Error logging print', details: error.message });
    }
  }
});

// Get print logs (Admin only)
router.get('/print-logs', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const logs = await PrintLog.find()
      .populate('userId', 'username personalInfo.firstName personalInfo.lastName')
      .sort({ timestamp: -1 });
    
    res.status(200).json(logs);
  } catch (error) {
    console.error('Error fetching print logs:', error);
    res.status(500).json({ error: 'Error fetching print logs', details: error.message });
  }
});

// Validate ID (Admin only)
router.post('/validate-id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { serialNumber } = req.body;

    if (!serialNumber) {
      return res.status(400).json({ error: 'Serial number is required' });
    }

    const logEntry = await PrintLog.findOne({ serialNumber })
      .populate('userId', 'personalInfo placeOfAssignment');
    
    if (!logEntry) {
      return res.status(404).json({ error: 'Invalid or unregistered ID' });
    }

    const user = logEntry.userId;
    const photoPath = user.personalInfo?.profilePhoto
      ? path.join(process.cwd(), 'uploads', user.personalInfo.profilePhoto)
      : null;

    res.status(200).json({
      valid: true,
      details: {
        tin: logEntry.tin,
        employeeName: logEntry.employeeName,
        serialNumber: logEntry.serialNumber,
        printedBy: logEntry.printedBy,
        timestamp: logEntry.timestamp,
        photoExists: photoPath && fs.existsSync(photoPath),
        position: user.personalInfo?.position || 'N/A',
        assignment: user.placeOfAssignment || 'N/A'
      }
    });
  } catch (error) {
    console.error('Error validating ID:', error);
    res.status(500).json({ error: 'Error validating ID', details: error.message });
  }
});

export default router;