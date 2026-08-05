// backend/models/WellnessLeaveCredit.js
//
// Per CSC Resolution No. 2501292 (13 Nov 2025) and CSC MC No. 01, s. 2026
// (Wellness Leave Policy): non-cumulative, non-commutable, forfeited if not
// availed of within the contract period. This ledger stores ONE document per
// (userId, year) — the calendar year the credit belongs to — which is what
// makes non-cumulative/no-carry-over automatic: a user's 2027 balance is
// simply a different document from their 2026 balance, nothing rolls over.
//
// `granted` is the total wellness leave days granted for that calendar year
// (0, 2.5, or 5). It is built up by backend/utils/wellnessLeaveCredits.js
// as qualifying contract events happen during the year:
//   - a NEW contract active in the year grants 2.5 (newGranted flag)
//   - a RENEWAL contract active in the year grants the full 5 outright if
//     it's the first event of the year, or tops the 2.5 up to 5 if a NEW
//     grant already happened earlier that same year (renewalTopUpGranted
//     flag). Either way, further RENEWAL events that same year add nothing
//     — that's the "if they renew again that calendar year, no credits
//     shall be added" rule.
import mongoose from 'mongoose';

const wellnessLeaveCreditSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  year: { type: Number, required: true },

  granted: { type: Number, required: true, default: 0 }, // 0, 2.5, or 5 for this calendar year

  // Flags guard against re-granting on duplicate/repeated contract events
  // in the same year (enforces non-cumulative per the policy).
  newGranted: { type: Boolean, default: false },
  renewalTopUpGranted: { type: Boolean, default: false },

  grantHistory: [{
    event: { type: String, enum: ['NEW', 'RENEWAL', 'RENEWAL_TOPUP'] },
    grantedAmount: Number,
    contractId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contract' },
    date: { type: Date, default: Date.now }
  }],

  // Manual overrides of `granted` — corrections, exceptions outside the
  // automatic NEW/RENEWAL rules, etc. Always additive (amount may be
  // negative to deduct); `granted` itself is the running total, this array
  // is the append-only audit trail behind it. A reason and the acting admin
  // are required on every entry (see POST /credits/:userId/adjust) so any
  // change to a figure that affects real pay/leave is always attributable.
  adjustmentHistory: [{
    amount: { type: Number, required: true }, // signed delta applied to `granted`
    before: Number,
    after: Number,
    reason: { type: String, required: true },
    adjustedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, default: Date.now }
  }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// One ledger per user per calendar year.
wellnessLeaveCreditSchema.index({ userId: 1, year: 1 }, { unique: true });

export default mongoose.model('WellnessLeaveCredit', wellnessLeaveCreditSchema);