import multer from 'multer';
import multerS3 from 'multer-s3';
import { r2Client, R2_BUCKET } from '../config/r2.js';
import path from 'path';
import crypto from 'crypto';

// All uploads go to bucket ROOT (no subfolder prefix)
// This matches how legacy files were migrated via aws s3 cp

// Strip path separators / control characters from a filename and cap its
// length, so an attacker-controlled originalname can't be used for path
// traversal or to inject arbitrary characters into the storage key.
const sanitizeFilename = (filename) => {
  const base = path.basename(filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  return base.slice(-150) || 'file';
};

const buildKey = (file) => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  const safeName = sanitizeFilename(file.originalname);
  return `${timestamp}-${random}-${safeName}`;
};

// Allowed document types: PDFs and common image formats.
const documentMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const documentExtensions = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);

const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const makeFileFilter = (allowedMimeTypes, allowedExtensions) => (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(ext)) {
    return cb(new Error('Unsupported file type. Allowed types: ' + [...allowedExtensions].join(', ')));
  }
  cb(null, true);
};

export const documentUpload = multer({
  storage: multerS3({
    s3: r2Client,
    bucket: R2_BUCKET,
    // Without this, multer-s3 stores every object as Content-Type:
    // application/octet-stream regardless of the actual file — which is
    // why a generated EODB PDF downloads instead of opening inline in the
    // browser's PDF viewer when later viewed from Documents.
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      cb(null, buildKey(file));
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: makeFileFilter(documentMimeTypes, documentExtensions),
});

export const profilePhotoUpload = multer({
  storage: multerS3({
    s3: r2Client,
    bucket: R2_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const userId = req.params.id;
      const timestamp = Date.now();
      const random = crypto.randomBytes(4).toString('hex');
      const ext = imageExtensions.has(path.extname(file.originalname || '').toLowerCase())
        ? path.extname(file.originalname).toLowerCase()
        : '.jpg';
      cb(null, `profile-${userId}-${timestamp}-${random}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: makeFileFilter(imageMimeTypes, imageExtensions),
});

export const signedContractUpload = multer({
  storage: multerS3({
    s3: r2Client,
    bucket: R2_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      cb(null, buildKey(file));
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: makeFileFilter(documentMimeTypes, documentExtensions),
});