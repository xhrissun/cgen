import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET } from '../config/r2.js';

// key = the R2 object key (e.g., "signed-contracts/1234567890-file.pdf")
export const deleteFromR2 = async (key) => {
  if (!key) return;
  try {
    await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch (err) {
    console.error('R2 delete error:', err.message);
  }
};