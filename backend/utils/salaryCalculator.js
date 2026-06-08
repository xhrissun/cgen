// backend/utils/salaryCalculator.js

/**
 * Simplified Salary Calculator - Only calculates premiums based on working days
 * All other data (salary, deductions) comes from manual input
 */

/**
 * Calculate working days in a month excluding weekends and holidays
 * @param {Date} startDate - Start date of the period
 * @param {Date} endDate - End date of the period
 * @param {Array} holidays - Array of holiday objects with date field
 * @returns {Object} - Working days breakdown by month
 */
export const calculateWorkingDays = (startDate, endDate, holidays = []) => {
  // Parse dates and force UTC
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Create a set of holiday dates for quick lookup (UTC dates only)
  const holidayDates = new Set(
    holidays.map(h => {
      const d = new Date(h.date);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    })
  );
  
  console.log('Holiday dates set:', Array.from(holidayDates));
  
  const monthlyBreakdown = {};
  
  // Step 1: Calculate total working days for ENTIRE months
  const startMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  
  let currentMonth = new Date(startMonth);
  
  while (currentMonth <= endMonth) {
    const year = currentMonth.getUTCFullYear();
    const month = currentMonth.getUTCMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    
    // Initialize month breakdown
    monthlyBreakdown[monthKey] = {
      year,
      month: month + 1,
      monthName: new Date(Date.UTC(year, month, 15)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
      totalWorkingDaysInMonth: 0,
      actualWorkingDaysInRange: 0,
      contractStartDay: null,
      contractEndDay: null,
      holidaysInMonth: []
    };
    
    // Count total working days in this ENTIRE month
    const firstDay = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    
    let weekendCount = 0;
    let holidayCount = 0;
    let workingCount = 0;
    
    let dayCounter = new Date(firstDay);
    while (dayCounter <= lastDay) {
      const dayOfWeek = dayCounter.getUTCDay();
      const dateStr = `${dayCounter.getUTCFullYear()}-${String(dayCounter.getUTCMonth() + 1).padStart(2, '0')}-${String(dayCounter.getUTCDate()).padStart(2, '0')}`;
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = holidayDates.has(dateStr);
      
      // DEBUG: Log each day for the month we're interested in
      if (month === 3) { // April debugging
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        console.log(`  ${dateStr} (${dayNames[dayOfWeek]}): Weekend=${isWeekend}, Holiday=${isHoliday}, Working=${!isWeekend && !isHoliday}`);
      }
      
      if (isWeekend) weekendCount++;
      if (isHoliday) {
        holidayCount++;
        monthlyBreakdown[monthKey].holidaysInMonth.push(dateStr);
      }
      
      if (!isWeekend && !isHoliday) {
        monthlyBreakdown[monthKey].totalWorkingDaysInMonth++;
        workingCount++;
      }
      
      dayCounter.setUTCDate(dayCounter.getUTCDate() + 1);
    }
    
    console.log(`${monthlyBreakdown[monthKey].monthName}: Total days: ${lastDay.getUTCDate()}, Weekends: ${weekendCount}, Holidays: ${holidayCount}, Working: ${workingCount}`);
    
    // Move to next month
    currentMonth.setUTCMonth(currentMonth.getUTCMonth() + 1);
  }
  
  // Step 2: Count actual working days WITHIN contract range
  let currentDate = new Date(start);
  
  while (currentDate <= end) {
    const year = currentDate.getUTCFullYear();
    const month = currentDate.getUTCMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    
    const dayOfWeek = currentDate.getUTCDay();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDate.getUTCDate()).padStart(2, '0')}`;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = holidayDates.has(dateStr);
    
    // Count working days within contract range
    if (!isWeekend && !isHoliday) {
      monthlyBreakdown[monthKey].actualWorkingDaysInRange++;
    }
    
    // Track contract start/end days
    if (currentDate.toISOString().split('T')[0] === start.toISOString().split('T')[0]) {
      monthlyBreakdown[monthKey].contractStartDay = currentDate.getUTCDate();
    }
    if (currentDate.toISOString().split('T')[0] === end.toISOString().split('T')[0]) {
      monthlyBreakdown[monthKey].contractEndDay = currentDate.getUTCDate();
    }
    
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }
  
  return monthlyBreakdown;
};

/**
 * Calculate premium for contract period based on working days
 * @param {Object} params - Calculation parameters
 * @returns {Object} - Premium breakdown
 */
export const calculatePremiumBreakdown = (params) => {
  const {
    monthlyPremium, // From salary grade form
    startDate,
    endDate,
    holidays = [],
    semester = 1 // 1 = First Semester, 2 = Second Semester
  } = params;
  
  console.log('=== PREMIUM CALCULATION START ===');
  console.log('Monthly Premium Rate:', monthlyPremium);
  console.log('Contract Period:', startDate, 'to', endDate);
  console.log('Holidays in period:', holidays.length);
  holidays.forEach(h => {
    console.log('  -', new Date(h.date).toISOString().split('T')[0], ':', h.name);
  });
  
  // Calculate working days breakdown
  const workingDaysBreakdown = calculateWorkingDays(startDate, endDate, holidays);
  
  console.log('\n--- WORKING DAYS BREAKDOWN ---');
  Object.keys(workingDaysBreakdown).forEach(monthKey => {
    const m = workingDaysBreakdown[monthKey];
    console.log(`${m.monthName} ${m.year}:`);
    console.log(`  Total working days in month: ${m.totalWorkingDaysInMonth}`);
    console.log(`  Actual working days in range: ${m.actualWorkingDaysInRange}`);
    console.log(`  Contract days: ${m.contractStartDay || 1} to ${m.contractEndDay || 'end'}`);
  });
  
  // Calculate premium for each month
  const premiumBreakdown = [];
  let finalPremium = 0;
  
  console.log('\n--- PREMIUM CALCULATION PER MONTH ---');
  
  Object.keys(workingDaysBreakdown).forEach(monthKey => {
    const monthData = workingDaysBreakdown[monthKey];
    const { totalWorkingDaysInMonth, actualWorkingDaysInRange } = monthData;
    
    let monthPremium = 0;
    let dailyPremium = monthlyPremium / totalWorkingDaysInMonth;
    
    if (actualWorkingDaysInRange === totalWorkingDaysInMonth) {
      // Full month within contract range
      monthPremium = monthlyPremium;
      console.log(`${monthData.monthName}: FULL MONTH`);
      console.log(`  Premium = ${monthlyPremium.toFixed(2)}`);
    } else {
      // Partial month - prorate based on actual working days
      monthPremium = dailyPremium * actualWorkingDaysInRange;
      console.log(`${monthData.monthName}: PARTIAL MONTH`);
      console.log(`  Daily Premium = ${monthlyPremium} / ${totalWorkingDaysInMonth} = ${dailyPremium.toFixed(6)}`);
      console.log(`  Month Premium = ${dailyPremium.toFixed(6)} × ${actualWorkingDaysInRange} = ${monthPremium.toFixed(6)}`);
    }
    
    premiumBreakdown.push({
      monthKey,
      ...monthData,
      monthlyPremiumRate: monthlyPremium,
      dailyPremiumRate: dailyPremium,
      calculatedPremium: monthPremium,
      isFullMonth: actualWorkingDaysInRange === totalWorkingDaysInMonth
    });
    
    finalPremium += monthPremium;
    console.log(`  Running Total: ${finalPremium.toFixed(2)}\n`);
  });
  
  // Calculate bonus based on semester
  const bonus = semester === 1 ? finalPremium : finalPremium;
  const bonusType = semester === 1 ? 'Mid-Year' : 'Year-End';
  
  console.log('\n=== FINAL RESULTS ===');
  console.log('Total Months:', premiumBreakdown.length);
  console.log('Full Months:', premiumBreakdown.filter(m => m.isFullMonth).length);
  console.log('Partial Months:', premiumBreakdown.filter(m => !m.isFullMonth).length);
  console.log('Total Working Days:', premiumBreakdown.reduce((sum, m) => sum + m.actualWorkingDaysInRange, 0));
  console.log('FINAL PREMIUM:', finalPremium.toFixed(2));
  console.log('Bonus Type:', bonusType);
  console.log('=========================\n');
  
  return {
    premiumBreakdown,
    finalPremium,
    bonus,
    bonusType,
    totalMonths: premiumBreakdown.length,
    fullMonths: premiumBreakdown.filter(m => m.isFullMonth).length,
    partialMonths: premiumBreakdown.filter(m => !m.isFullMonth).length,
    totalWorkingDays: premiumBreakdown.reduce((sum, m) => sum + m.actualWorkingDaysInRange, 0)
  };
};

/**
 * Number to words conversion for Philippine Peso
 * @param {Number} amount - Amount to convert
 * @returns {String} - Amount in words
 */
export const numberToWords = (amount) => {
  const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
  const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
  const teens = ['TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
  
  if (amount === 0) return 'ZERO PESOS';
  
  const convert = (n) => {
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' HUNDRED' + (n % 100 ? ' ' + convert(n % 100) : '');
    if (n < 1000000) return convert(Math.floor(n / 1000)) + ' THOUSAND' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    return convert(Math.floor(n / 1000000)) + ' MILLION' + (n % 1000000 ? ' ' + convert(n % 1000000) : '');
  };
  
  const [intPart, decPart] = amount.toFixed(2).split('.');
  let result = convert(parseInt(intPart)) + ' PESOS';
  if (parseInt(decPart) > 0) {
    result += ' AND ' + convert(parseInt(decPart)) + ' CENTAVOS';
  }
  return result;
};

/**
 * Format amount in accounting format
 * @param {Number} amount - Amount to format
 * @returns {String} - Formatted amount
 */
export const formatCurrency = (amount) => {
  return '₱' + amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

export default {
  calculateWorkingDays,
  calculatePremiumBreakdown,
  numberToWords,
  formatCurrency
};