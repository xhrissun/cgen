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
import Contract from '../models/Contract.js';

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

// ─── Recompute (source of truth = the user's actual contracts) ─────────────
//
// grantWellnessLeaveCredits above is event-driven and can only ever go UP:
// if a contract is later cancelled, deleted, or its mode/year is edited, the
// ledger kept the old grant. That is how an employee whose only live contract
// is NEW (2.5) could still carry 5 — e.g. a RENEWAL contract created by
// mistake, then replaced by a NEW one (the stale RENEWAL gets CANCELLED or
// deleted, the 5 stays).
//
// This derives the base grant for (userId, year) from the contracts that
// still count (anything not CANCELLED, archived or not):
//   any RENEWAL -> 5, else any NEW -> 2.5, else 0
// then adds the sum of manual adjustments so admin corrections survive.
const BASE_BY_MODE = { NEW: 2.5, RENEWAL: 5 };

function contractYear(c) {
  if (c.year) return c.year;
  // Manila calendar year of the start date
  return new Date(new Date(c.startDate).getTime() + 8 * 3600 * 1000).getUTCFullYear();
}

export async function recomputeWellnessLeaveCredits(userId, year, { dryRun = false } = {}) {
  if (!userId || !year) return null;
  year = parseInt(year, 10);

  const contracts = await Contract.find({ userId, status: { $ne: 'CANCELLED' } })
    .select('mode year startDate')
    .lean();
  const modes = contracts.filter(c => contractYear(c) === year).map(c => c.mode);

  const base = modes.includes('RENEWAL') ? BASE_BY_MODE.RENEWAL
    : modes.includes('NEW') ? BASE_BY_MODE.NEW
    : 0;

  const ledger = await WellnessLeaveCredit.findOne({ userId, year });
  if (!ledger) {
    if (base === 0 || dryRun) return { userId, year, before: 0, after: base, changed: base !== 0 };
    const created = new WellnessLeaveCredit({
      userId, year, granted: base,
      newGranted: modes.includes('NEW'),
      renewalTopUpGranted: modes.includes('RENEWAL'),
      grantHistory: [{ event: modes.includes('RENEWAL') ? 'RENEWAL' : 'NEW', grantedAmount: base, date: new Date() }]
    });
    await created.save();
    return { userId, year, before: 0, after: base, changed: true };
  }

  const adjustments = (ledger.adjustmentHistory || []).reduce((sum, a) => sum + (a.amount || 0), 0);
  const after = Math.max(0, Math.round((base + adjustments) * 100) / 100);
  const before = ledger.granted;
  const result = { userId, year, before, after, changed: before !== after };
  if (dryRun || !result.changed) return result;

  ledger.granted = after;
  ledger.newGranted = modes.includes('NEW') || modes.includes('RENEWAL');
  ledger.renewalTopUpGranted = modes.includes('RENEWAL');
  ledger.grantHistory.push({ event: 'RECOMPUTE', grantedAmount: after - before, date: new Date() });
  ledger.updatedAt = new Date();
  await ledger.save();
  return result;
}

// Recompute several (userId, year) pairs; never throws (best-effort, logged).
export async function recomputeWellnessLeaveCreditsFor(pairs) {
  const seen = new Set();
  for (const { userId, year } of pairs) {
    if (!userId || !year) continue;
    const key = `${userId}-${year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await recomputeWellnessLeaveCredits(userId, year);
    } catch (err) {
      console.error('⚠️ Wellness Leave credit recompute failed for', key, err.message);
    }
  }
}

export { contractYear };