// backend/utils/holidayResolver.js
//
// ROOT CAUSE FIX: Holiday documents have an `isRecurring` flag, but nothing
// in the codebase ever used it. Every holiday query (contracts.js,
// routes/holidays.js) matched on the LITERAL stored `date` field only —
// so a holiday entered once for, say, 2025 would never show up for a 2026
// (or any other year) contract, even if "Recurring" was checked when it
// was created. This made the Monthly Premium Breakdown's holiday chips
// silently disappear for any year other than the one the holiday was
// originally entered under.
//
// This module fetches every holiday once and "projects" the recurring ones
// onto every year that overlaps the requested date range, using the
// holiday's month/day. Non-recurring holidays are only included if their
// literal date falls inside the range, same as before.

import Holiday from '../models/Holiday.js';

/**
 * Resolve all holidays (recurring + one-off) that fall within [startDate, endDate].
 * @param {Date|String} startDate
 * @param {Date|String} endDate
 * @returns {Promise<Array>} - Array of { date (Date, UTC midnight), name, type, isRecurring, premiumRate, _id }
 */
export const resolveHolidaysInRange = async (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Holidays are few (tens per year), so it's cheapest/simplest to fetch
  // everything once and resolve in memory rather than build a complex
  // Mongo $expr query for "any year, same month/day".
  const allHolidays = await Holiday.find({});

  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();

  const resolved = [];
  const seen = new Set(); // dedupe by date+name in case of overlapping entries

  for (const h of allHolidays) {
    const hDate = new Date(h.date);
    const month = hDate.getUTCMonth();
    const day = hDate.getUTCDate();

    if (h.isRecurring) {
      // Project this holiday onto every year overlapping the range
      for (let year = startYear; year <= endYear; year++) {
        const occurrence = new Date(Date.UTC(year, month, day));
        if (occurrence >= startOfDayUTC(start) && occurrence <= endOfDayUTC(end)) {
          const key = `${occurrence.toISOString().split('T')[0]}|${h.name}`;
          if (!seen.has(key)) {
            seen.add(key);
            resolved.push({
              _id: h._id,
              name: h.name,
              date: occurrence,
              type: h.type,
              isRecurring: true,
              premiumRate: h.premiumRate
            });
          }
        }
      }
    } else {
      // One-off: only include if the literal date is within range
      if (hDate >= startOfDayUTC(start) && hDate <= endOfDayUTC(end)) {
        const key = `${hDate.toISOString().split('T')[0]}|${h.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          resolved.push({
            _id: h._id,
            name: h.name,
            date: hDate,
            type: h.type,
            isRecurring: false,
            premiumRate: h.premiumRate
          });
        }
      }
    }
  }

  resolved.sort((a, b) => a.date - b.date);
  return resolved;
};

function startOfDayUTC(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}

function endOfDayUTC(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

export default { resolveHolidaysInRange };