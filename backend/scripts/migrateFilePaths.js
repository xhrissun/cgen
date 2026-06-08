import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Contract from '../models/Contract.js';

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

await mongoose.connect(process.env.MONGODB_URI);

// Migrate user profile photos
const users = await User.find({ profilePhoto: { $exists: true, $ne: null } });
for (const user of users) {
  if (user.profilePhoto && !user.profilePhoto.startsWith('http')) {
    const filename = user.profilePhoto.replace(/^uploads\//, '');
    user.profilePhoto = `${R2_PUBLIC_URL}/profile-photos/${filename}`;
    await user.save();
    console.log(`Updated user ${user._id} profilePhoto`);
  }
}

// Migrate user documents
const usersWithDocs = await User.find({ 'documents.0': { $exists: true } });
for (const user of usersWithDocs) {
  let changed = false;
  for (const doc of user.documents) {
    if (doc.path && !doc.path.startsWith('http')) {
      const filename = doc.path.replace(/^uploads\//, '');
      doc.url = `${R2_PUBLIC_URL}/documents/${filename}`;
      doc.key = `documents/${filename}`;
      changed = true;
    }
  }
  if (changed) {
    await user.save();
    console.log(`Updated documents for user ${user._id}`);
  }
}

// Migrate signed contracts
const contracts = await Contract.find({ 'signedContractFile.path': { $exists: true } });
for (const contract of contracts) {
  if (contract.signedContractFile?.path && !contract.signedContractFile.path.startsWith('http')) {
    const filename = contract.signedContractFile.path.replace(/^uploads\/signed-contracts\//, '');
    contract.signedContractFile.url = `${R2_PUBLIC_URL}/signed-contracts/${filename}`;
    contract.signedContractFile.key = `signed-contracts/${filename}`;
    await contract.save();
    console.log(`Updated contract ${contract._id} signedContractFile`);
  }
}

console.log('Migration complete.');
await mongoose.disconnect();