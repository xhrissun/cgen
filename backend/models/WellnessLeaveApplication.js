// backend/models/WellnessLeaveApplication.js
//
// A Wellness Leave application. Filing it does NOT deduct credits — credits
// are only considered used once status === 'APPROVED' (balance is computed
// on the fly by summing APPROVED applications for the year; see
// backend/routes/wellnessLeave.js getBalance()). This is what implements
// "shall not be deducted unless approved".
//
// Workflow: PENDING (filed by contractual)
//        -> RECOMMENDED or DISAPPROVED (immediate supervisor / focal person)
//        -> APPROVED or DISAPPROVED (Assistant Regional Director for
//           Management Services — recorded either manually by an admin, or
//           by the admin scanning the QR code printed on the signed paper
//           form, per qrToken below)
// A PENDING or RECOMMENDED application can also be CANCELLED by the
// applicant.
import mongoose from 'mongoose';
import crypto from 'crypto';

const wellnessLeaveApplicationSchema = new mongoose.Schema({
  applicationNumber: { type: String, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Calendar year the credits are charged against (calendar year of startDate).
  year: { type: Number, required: true },

  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  daysRequested: { type: Number, required: true, min: 0.5 },
  reason: { type: String },

  // Snapshot of the employee at filing time so the printed form and QR
  // verification page read correctly even if the profile changes later.
  employeeSnapshot: {
    fullName: String,
    position: String,
    placeOfAssignment: String,
    contractMode: String // NEW | RENEWAL — informational only, not used for grants
  },

  status: {
    type: String,
    enum: ['PENDING', 'RECOMMENDED', 'DISAPPROVED', 'APPROVED', 'CANCELLED'],
    default: 'PENDING'
  },

  // Set only by POST /applications/manual (ADMINISTRATOR only), for leave
  // that was actually filed and acted on entirely on paper before this
  // module existed, and is being entered afterward purely so credit
  // balances/history stay accurate. Never touched by the normal filing or
  // approval endpoints — this is what makes a backfilled record clearly
  // distinguishable from anything the online workflow produced, and who
  // logged it (and why) is recorded permanently for audit purposes.
  manualEntry: {
    isManual: { type: Boolean, default: false },
    loggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    loggedAt: Date,
    note: String // required at the route level — e.g. the paper form's reference no.
  },

  supervisor: {
    name: String,
    position: String,
    action: { type: String, enum: ['RECOMMENDED', 'DISAPPROVED'] },
    remarks: String,
    actionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actionDate: Date
  },

  // Assistant Regional Director for Management Services
  approver: {
    name: String,
    position: { type: String, default: 'Assistant Regional Director for Management Services' },
    action: { type: String, enum: ['APPROVED', 'DISAPPROVED'] },
    remarks: String,
    actionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actionDate: Date
  },

  // The printed CS Form No. 6 (A4) carries a QR code encoding
  // {FRONTEND_URL}/wellness-scan/:id/:qrToken. After the paper has been
  // physically signed by the employee, recommended by the supervisor, and
  // approved by the ARD for Management Services, an admin scans the code to
  // log that approval in the system (this is what deducts the credit).
  qrToken: { type: String, required: true },
  qrScannedAt: Date,
  qrScannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  cancelledAt: Date,
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelReason: String,

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Auto-generate a human-readable application number, same retry pattern as
// Contract.contractNumber (backend/models/Contract.js).
//
// IMPORTANT: this must be pre('validate'), not pre('save'). Mongoose's
// document save pipeline runs validation *before* 'save' hooks, so setting
// a required field (qrToken) inside pre('save') is always too late — the
// required-field validator sees `undefined` and rejects the document before
// this hook ever runs. Contract.contractNumber doesn't have this problem
// because it isn't marked `required`, so pre('save') happened to work there.
wellnessLeaveApplicationSchema.pre('validate', async function (next) {
  try {
    if (!this.qrToken) {
      this.qrToken = crypto.randomBytes(16).toString('hex');
    }

    if (!this.applicationNumber) {
      const maxRetries = 5;
      let attempt = 0;
      while (attempt < maxRetries) {
        try {
          const year = new Date().getFullYear();
          const prefix = `WL-${year}-`;

          const last = await mongoose.model('WellnessLeaveApplication')
            .findOne({ applicationNumber: { $regex: `^${prefix}` } })
            .sort({ applicationNumber: -1 })
            .select('applicationNumber')
            .lean();

          let nextNumber = 1;
          if (last?.applicationNumber) {
            const match = last.applicationNumber.match(/WL-\d{4}-(\d+)$/);
            if (match) nextNumber = parseInt(match[1], 10) + 1;
          }
          nextNumber += attempt;

          this.applicationNumber = `${prefix}${String(nextNumber).padStart(5, '0')}`;
          break;
        } catch (err) {
          attempt++;
          if (attempt >= maxRetries) return next(err);
          await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
        }
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

wellnessLeaveApplicationSchema.index({ userId: 1, year: 1 });
wellnessLeaveApplicationSchema.index({ status: 1 });
wellnessLeaveApplicationSchema.index({ qrToken: 1 });

export default mongoose.model('WellnessLeaveApplication', wellnessLeaveApplicationSchema);