import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
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