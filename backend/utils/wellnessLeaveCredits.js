// backend/utils/wellnessLeaveCredits.js
//
// Applies CSC Resolution No. 2501292 / CSC MC No. 01, s. 2026 Wellness Leave
// grant rules to a single contract event (called from
// backend/routes/contracts.js right after a contract is created/saved).
//
// Rule recap (per calendar year, non-cumulative):
//  - A NEW-mode contract active in year Y grants 2.5 days for Y.
//  - A RENEWAL-mode contract active in year Y grants 5 days for Y — UNLESS
//    a NEW grant already happened earlier that same year Y, in which case
//    it tops the existing 2.5 up to 5 (one-time top-up).
//  - Once a year has received its RENEWAL grant/top-up, further RENEWAL
//    events that same year add nothing ("if they renew again that calendar
//    year, no credits shall be added").
import WellnessLeaveCredit from '../models/WellnessLeaveCredit.js';

export async function grantWellnessLeaveCredits({ userId, mode, year, contractId }) {
  if (!userId || !year || !['NEW', 'RENEWAL'].includes(mode)) return null;

  let ledger = await WellnessLeaveCredit.findOne({ userId, year });

  if (!ledger) {
    const grantedAmount = mode === 'NEW' ? 2.5 : 5;
    ledger = new WellnessLeaveCredit({
      userId,
      year,
      granted: grantedAmount,
      newGranted: mode === 'NEW',
      renewalTopUpGranted: mode === 'RENEWAL',
      grantHistory: [{ event: mode, grantedAmount, contractId, date: new Date() }]
    });
    await ledger.save();
    return ledger;
  }

  // Non-cumulative: a repeated NEW event, or a RENEWAL event in a year that
  // already reached its cap, changes nothing.
  if (mode === 'RENEWAL' && !ledger.renewalTopUpGranted) {
    const before = ledger.granted;
    ledger.granted = 5;
    ledger.renewalTopUpGranted = true;
    ledger.grantHistory.push({
      event: 'RENEWAL_TOPUP',
      grantedAmount: ledger.granted - before,
      contractId,
      date: new Date()
    });
    await ledger.save();
  }

  return ledger;
}