import multer from 'multer';
import multerS3 from 'multer-s3';
import { r2Client, R2_BUCKET } from '../config/r2.js';
import path from 'path';

// All uploads go to bucket ROOT (no subfolder prefix)
// This matches how legacy files were migrated via aws s3 cp

export const documentUpload = multer({
  storage: multerS3({
    s3: r2Client,
    bucket: R2_BUCKET,
    key: (req, file, cb) => {
      const timestamp = Date.now();
      const ext = path.extname(file.originalname);
      cb(null, `${timestamp}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const profilePhotoUpload = multer({
  storage: multerS3({
    s3: r2Client,
    bucket: R2_BUCKET,
    key: (req, file, cb) => {
      const userId = req.params.id;
      const timestamp = Date.now();
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `profile-${userId}-${timestamp}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const signedContractUpload = multer({
  storage: multerS3({
    s3: r2Client,
    bucket: R2_BUCKET,
    key: (req, file, cb) => {
      const timestamp = Date.now();
      cb(null, `${timestamp}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});