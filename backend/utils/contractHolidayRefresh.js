// backend/utils/contractHolidayRefresh.js
//
// ROOT CAUSE: holidaysInMonth / workingDaysBreakdown / finalPremium are
// snapshotted onto the Contract document at creation time (see
// routes/contracts.js POST '/'). resolveHolidaysInRange() is correct and
// holidays.js correctly resolves recurring holidays for any year — but
// nothing ever re-ran that resolution against EXISTING contracts after a
// holiday was added, edited, or deleted. So a holiday added today (e.g.
// "National Heroes Day" on Aug 31, 2026) never shows up on a contract's
// calendar/premium breakdown if that contract was generated before the
// holiday existed in the DB, even though the contract's period clearly
// covers that date.
//
// Mirrors the same temporal-integrity rule already used for position
// edits (routes/positions.js): ONLY contracts that have not yet been
// signed/approved (DRAFT, PENDING) are refreshed. APPROVED/ACTIVE/EXPIRED/
// TERMINATED/CANCELLED contracts are the legal record as of signing date
// and are never silently rewritten.

import Contract from '../models/Contract.js';
import { resolveHolidaysInRange } from './holidayResolver.js';
import { calculatePremiumBreakdown, numberToWords } from './salaryCalculator.js';

const DRAFT_STATUSES = ['DRAFT', 'PENDING'];

/**
 * Recompute holidaysInMonth / workingDaysBreakdown / finalPremium for every
 * unsigned (DRAFT/PENDING) contract whose period could be affected by a
 * holiday change. Call this after any Holiday create/update/delete/bulk op.
 *
 * @returns {Promise<number>} number of contracts actually updated
 */
export const refreshUnsignedContractsHolidays = async () => {
  const unsignedContracts = await Contract.find({ status: { $in: DRAFT_STATUSES } });

  let updatedCount = 0;

  for (const contract of unsignedContracts) {
    const contractStart = new Date(contract.startDate);
    const contractEnd = new Date(contract.endDate);

    const firstDayOfStartMonth = new Date(contractStart.getFullYear(), contractStart.getMonth(), 1);
    const lastDayOfEndMonth = new Date(contractEnd.getFullYear(), contractEnd.getMonth() + 1, 0);

    const holidays = await resolveHolidaysInRange(firstDayOfStartMonth, lastDayOfEndMonth);

    const premiumCalc = calculatePremiumBreakdown({
      monthlyPremium: contract.monthlyPremium,
      startDate: contractStart,
      endDate: contractEnd,
      holidays,
      semester: contract.semester
    });

    const oldPremium = contract.finalPremium;
    const oldHolidayCount = (contract.workingDaysBreakdown || [])
      .reduce((sum, m) => sum + (m.holidaysInMonth?.length || 0), 0);
    const newHolidayCount = premiumCalc.premiumBreakdown
      .reduce((sum, m) => sum + (m.holidaysInMonth?.length || 0), 0);

    const changed = oldPremium !== premiumCalc.finalPremium || oldHolidayCount !== newHolidayCount;

    if (changed) {
      contract.workingDaysBreakdown = premiumCalc.premiumBreakdown;
      contract.finalPremium = premiumCalc.finalPremium;
      contract.finalPremiumInWords = numberToWords(premiumCalc.finalPremium);
      contract.bonusType = premiumCalc.bonusType;
      contract.premiumSummary = {
        totalMonths: premiumCalc.totalMonths,
        fullMonths: premiumCalc.fullMonths,
        partialMonths: premiumCalc.partialMonths,
        totalWorkingDays: premiumCalc.totalWorkingDays
      };

      await contract.save();
      updatedCount++;
      console.log(`↺ Refreshed holidays/premium for contract ${contract.contractNumber} (${contract.status}): ₱${oldPremium?.toFixed?.(2)} → ₱${premiumCalc.finalPremium.toFixed(2)}`);
    }
  }

  return updatedCount;
};

export default { refreshUnsignedContractsHolidays };