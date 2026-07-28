import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false },
  // Set to true whenever an account is given a password the user didn't
  // choose themselves (new-account creation, admin password reset) — see
  // POST /api/users and POST /api/users/:id/reset-password. New accounts
  // default to a predictable password (the employee's own TIN, or '123456'
  // if none is on file), so this is what actually closes that gap: the
  // frontend blocks access to the rest of the app until the user sets a
  // password only they know.
  mustChangePassword: { type: Boolean, default: true },
  role: { 
    type: String, 
    enum: ['ADMINISTRATOR', 'CONTRACTUAL', 'FOCAL_PERSON', 'FINANCE_OFFICER'],
    required: true 
  },
  status: { type: String, enum: ['ACTIVE', 'PENDING', 'INACTIVE'], default: 'ACTIVE' },
  placeOfAssignment: { type: String },
  
  // Personal Information
  personalInfo: {
    lastName: String,
    firstName: String,
    middleName: String,
    middleInitial: String,
    suffix: String,
    sex: { type: String, enum: ['MALE', 'FEMALE'] },
    placeOfBirth: String,
    birthday: Date,
    phoneNumber: String,
    email: String,
    address: String,
    philhealth: String,
    pagibig: String,
    tin: String,
    highestEducation: String,
    bachelorsDegree: String,
    eligibility: String,
    profilePhoto: String 
  },
  
  // Contract History
  contractHistory: [{
    contractId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contract' },
    mode: { type: String, enum: ['NEW', 'RENEWAL'] },
    startDate: Date,
    endDate: Date,
    position: String,
    status: { type: String, enum: ['ACTIVE', 'EXPIRED', 'TERMINATED'] }
  }],
  
  // Uploaded Documents
  documents: [{
    type: { type: String, enum: ['SIGNED_CONTRACT', 'PHOTO', 'PASSPORT_PHOTO', 'EODB_ID', 'OTHERS'] },
    filename: String,   // Full R2 URL (new) or legacy short filename (old data)
    key: String,        // R2 object key e.g. "profile-photos/profile-xxx.jpg"
    url: String,        // Full public R2 URL (explicit copy of filename for new uploads)
    uploadDate: { type: Date, default: Date.now },
    description: String,
    contractNumber: String
  }],
  
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Performance indexes
userSchema.index({ placeOfAssignment: 1, role: 1 }); // covers FOCAL_PERSON user lookups
userSchema.index({ role: 1, status: 1 });             // covers admin queries

export default mongoose.model('User', userSchema);