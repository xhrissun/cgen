// backend/routes/contracts.js
// FILE: cgen-main/backend/routes/contracts.js

import express from 'express';
import { errDetail } from '../utils/errors.js';
import Contract from '../models/Contract.js';
import User from '../models/User.js';
import Position from '../models/Position.js';
import SalaryGrade from '../models/SalaryGrade.js';
import { verifyToken } from './auth.js';
import { Parser } from 'json2csv';
import csv from 'csv-parser';
import { signedContractUpload } from '../utils/r2Upload.js';
import { deleteFromR2 } from '../utils/r2Delete.js';
import { R2_PUBLIC_URL } from '../config/r2.js';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { resolveHolidaysInRange } from '../utils/holidayResolver.js';
import { calculatePremiumBreakdown } from '../utils/salaryCalculator.js';
import { logActivity } from '../utils/activityLogger.js';
import { buildDutiesLatex } from '../utils/dutiesRenderer.js';
import { resolvePositionClauses } from '../utils/clauseResolver.js';
import Notification from '../models/Notification.js';

// Add this AFTER your imports, BEFORE router.get('/:id/generate')
const sanitizeFilename = (str = '') => {
  return String(str)
    .trim()
    .replace(/[_]+/g, '')                    // Remove underscores
    .replace(/[^a-zA-Z0-9\s,.-]/g, '')      // Remove special chars
    .replace(/\s+/g, ' ')                    // Normalize spaces
    .replace(/[.\s]+$/g, '')                 // 🚨 CRITICAL: Remove trailing dots/spaces
    .trim();
};

// Some staff have typed a placeholder ("-", "N/A", "NONE", etc.) into the
// Middle Name field just to satisfy the "required field" profile-completeness
// check, since a person can legitimately have no middle name. Without this
// normalization, that placeholder gets treated as a real middle name/initial
// and prints as e.g. "JUAN -. DELA CRUZ" on the generated contract. Treat
// any placeholder-only value the same as an empty middle name everywhere.
const NO_MIDDLE_NAME_PATTERN = /^[\s\-._]*$|^(n\/?a\.?|none|no\s*middle\s*name)$/i;
const normalizeMiddleName = (value) => {
  const trimmed = String(value || '').trim();
  return NO_MIDDLE_NAME_PATTERN.test(trimmed) ? '' : trimmed;
};

// Enhanced filename builder
const buildSafeFilename = (lastName, firstName, middleInitial, suffix) => {
  const clean = (str) => sanitizeFilename(str).toUpperCase();

  const parts = [clean(lastName), clean(firstName)];

  if (middleInitial) {
    let mi = clean(middleInitial).replace(/^\.+|\.+$/g, '');
    if (mi) parts.push(mi);
  }

  if (suffix) {
    const s = clean(suffix);
    if (s) parts.push(s);
  }

  let filename = parts.join(' ').trim();
  
  // Final safety checks
  filename = filename
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s*\.\s*/g, '.')
    .replace(/[.\s]+$/g, '');  // 🔥 CRITICAL FIX

  return filename || 'contract'; // Fallback if empty
};


const convertBulletsToLatex = (text) => {
  if (!text) return '';
  
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  let result = '';
  let inList = false;
  let listItems = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if line starts with bullet point (•, -, *, or number.)
    const isBullet = /^[•\-\*]\s+/.test(line) || /^\d+\.\s+/.test(line);
    
    if (isBullet) {
      if (!inList) {
        // Start a new list
        inList = true;
        listItems = [];
      }
      
      // Extract content after bullet
      const content = line.replace(/^[•\-\*]\s+/, '').replace(/^\d+\.\s+/, '').trim();
      listItems.push(content);
    } else {
      // Not a bullet point
      if (inList) {
        // Close the previous list with tighter spacing
        result += '\n\\begin{itemize}[leftmargin=0.5in,itemsep=2pt,parsep=0pt,topsep=4pt]\n';
        listItems.forEach(item => {
          result += `\\item ${item}\n`;
        });
        result += '\\end{itemize}\n\n';
        inList = false;
        listItems = [];
      }
      
      // Add the regular line
      result += line + '\n';
    }
  }
  
  // Close any remaining open list
  if (inList && listItems.length > 0) {
    result += '\n\\begin{itemize}[leftmargin=0.5in,itemsep=2pt,parsep=0pt,topsep=4pt]\n';
    listItems.forEach(item => {
      result += `\\item ${item}\n`;
    });
    result += '\\end{itemize}\n';
  }
  
  return result.trim();
};



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const execPromise = promisify(exec);

// Number to words conversion
const numberToWords = (num) => {
  const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
  const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
  const teens = ['TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
  
  if (num === 0) return 'ZERO';
  
  const convert = (n) => {
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' HUNDRED' + (n % 100 ? ' ' + convert(n % 100) : '');
    if (n < 1000000) return convert(Math.floor(n / 1000)) + ' THOUSAND' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    return convert(Math.floor(n / 1000000)) + ' MILLION' + (n % 1000000 ? ' ' + convert(n % 1000000) : '');
  };
  
  const [intPart, decPart] = num.toFixed(2).split('.');
  let result = convert(parseInt(intPart)) + ' PESOS';
  if (parseInt(decPart) > 0) {
    result += ' AND ' + convert(parseInt(decPart)) + ' CENTAVOS';
  }
  return result;
};

// Escape LaTeX special characters
const escapeLatex = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%$#_{}]/g, '\\$&')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
};

// Get all contracts
// Get all contracts
router.get('/', verifyToken, async (req, res) => {
  try {
    let query = {};
    
    if (req.user.role === 'CONTRACTUAL') {
      query.userId = req.user.userId;
    } else if (req.user.role === 'FOCAL_PERSON') {
      // Get current user's place of assignment
      const currentUser = await User.findById(req.user.userId);
      
      // Find all users (both CONTRACTUAL and FOCAL_PERSON) with same place of assignment
      const users = await User.find({ 
        placeOfAssignment: currentUser.placeOfAssignment,
        role: { $in: ['CONTRACTUAL', 'FOCAL_PERSON'] }  // Add this line
      });
      query.userId = { $in: users.map(u => u._id) };
    }
    
    const contracts = await Contract.find(query)
      .populate('userId', 'username personalInfo placeOfAssignment')
      .populate('clauses.clauseId')
      .sort({ createdAt: -1 });
    
    res.json(contracts);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Live duplicate check — used by the contract creation form to warn the
// user interactively (before they even submit) that a matching contract
// already exists. Mirrors the exact key used by the POST '/' duplicate
// guard below: same employee + position + contract period (year +
// semester) with a non-cancelled, non-archived record.
// IMPORTANT: this must be registered BEFORE GET '/:id' below, or Express
// will treat "check-existing" as an :id value and this route will never
// be reached.
router.get('/check-existing', verifyToken, async (req, res) => {
  try {
    const { userId, position, year, semester } = req.query;

    if (!userId || !position || !year || !semester) {
      return res.json({ duplicate: false });
    }

    const existingContract = await Contract.findOne({
      userId,
      position,
      year: parseInt(year),
      semester: parseInt(semester),
      status: { $ne: 'CANCELLED' },
      isArchived: false
    }).select('_id contractNumber status').lean();

    if (!existingContract) {
      return res.json({ duplicate: false });
    }

    res.json({
      duplicate: true,
      existingContract
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// ── Active Employees Monitor ──────────────────────────────────────────────
// Restricted to ADMINISTRATOR and FINANCE_OFFICER — this surfaces salary,
// deduction, and charging figures across all currently-active employees,
// which is financial/HR-sensitive data, same access level as the CSV
// export and Finance Officer Dashboard elsewhere in this file.
// IMPORTANT: registered BEFORE GET '/:id' below, or Express treats
// "monitor" as an :id value and these routes are never reached.
const buildActiveEmployeesData = async () => {
  const contracts = await Contract.find({ status: 'ACTIVE', isArchived: false })
    .populate('userId')
    .sort({ createdAt: -1 })
    .lean();

  // One row per employee — in case more than one ACTIVE contract somehow
  // exists for the same person, keep only the most recently created one.
  const latestByUser = new Map();
  contracts.forEach((c) => {
    const uid = c.userId?._id?.toString();
    if (!uid) return;
    if (!latestByUser.has(uid)) latestByUser.set(uid, c);
  });

  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;

  const employees = Array.from(latestByUser.values()).map((c) => {
    const pi = c.userId?.personalInfo || {};
    const middleName = normalizeMiddleName(pi.middleName);
    const fullName = pi.lastName && pi.firstName
      ? `${pi.lastName}, ${pi.firstName}${middleName ? ' ' + middleName : ''}`
      : 'N/A';

    const endDate = new Date(c.endDate);
    const daysRemaining = Math.ceil((endDate - now) / msPerDay);

    return {
      contractId: c._id,
      contractNumber: c.contractNumber,
      userId: c.userId?._id,
      fullName,
      username: c.userId?.username || 'N/A',
      position: c.position,
      placeOfAssignment: c.placeOfAssignment,
      charging: c.charging || 'N/A',
      mode: c.mode,
      year: c.year,
      semester: c.semester === 1 ? 'First' : 'Second',
      startDate: c.startDate,
      endDate: c.endDate,
      daysRemaining,
      expiringSoon: daysRemaining <= 30,
      isSpecialSalaryGrade: !!c.isSpecialSalaryGrade,
      basicSalary: c.basicSalary || 0,
      monthlySalaryAsPerContract: c.monthlySalaryAsPerContract || 0,
      dailySalaryAsPerContract: c.dailySalaryAsPerContract || 0,
      monthlyPremium: c.monthlyPremium || 0,
      finalPremium: c.finalPremium || 0,
      bonusType: c.bonusType || 'N/A',
      deductions: {
        sss: c.deductions?.sss || 0,
        pagibig: c.deductions?.pagibig || 0,
        philhealth: c.deductions?.philhealth || 0,
        total: c.deductions?.total || 0
      },
      philhealth: pi.philhealth || 'N/A',
      pagibig: pi.pagibig || 'N/A',
      tin: pi.tin || 'N/A'
    };
  });

  // Summary aggregates
  const totalActiveEmployees = employees.length;
  const totalMonthlySalarySpend = employees.reduce((sum, e) => sum + e.monthlySalaryAsPerContract, 0);
  const totalMonthlyPremiumSpend = employees.reduce((sum, e) => sum + e.monthlyPremium, 0);
  const totalDeductionsSpend = employees.reduce((sum, e) => sum + (e.deductions.total || 0), 0);
  const contractsExpiringSoon = employees.filter(e => e.expiringSoon).length;

  const byChargingMap = new Map();
  employees.forEach((e) => {
    const key = e.charging || 'UNSPECIFIED';
    if (!byChargingMap.has(key)) {
      byChargingMap.set(key, { charging: key, count: 0, totalMonthlySalary: 0 });
    }
    const entry = byChargingMap.get(key);
    entry.count += 1;
    entry.totalMonthlySalary += e.monthlySalaryAsPerContract;
  });

  const byAssignmentMap = new Map();
  employees.forEach((e) => {
    const key = e.placeOfAssignment || 'UNSPECIFIED';
    if (!byAssignmentMap.has(key)) {
      byAssignmentMap.set(key, { placeOfAssignment: key, count: 0 });
    }
    byAssignmentMap.get(key).count += 1;
  });

  return {
    summary: {
      totalActiveEmployees,
      totalMonthlySalarySpend,
      totalMonthlyPremiumSpend,
      totalDeductionsSpend,
      contractsExpiringSoon,
      byCharging: Array.from(byChargingMap.values()).sort((a, b) => b.count - a.count),
      byPlaceOfAssignment: Array.from(byAssignmentMap.values()).sort((a, b) => b.count - a.count)
    },
    employees
  };
};

router.get('/monitor/active-employees', verifyToken, async (req, res) => {
  try {
    if (!['ADMINISTRATOR', 'FINANCE_OFFICER'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const data = await buildActiveEmployeesData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

router.get('/monitor/active-employees/csv', verifyToken, async (req, res) => {
  try {
    if (!['ADMINISTRATOR', 'FINANCE_OFFICER'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const { employees } = await buildActiveEmployeesData();

    const data = employees.map(e => ({
      contractNumber: e.contractNumber,
      fullName: e.fullName,
      username: e.username,
      position: e.position?.toUpperCase() || 'N/A',
      placeOfAssignment: e.placeOfAssignment,
      charging: e.charging,
      mode: e.mode,
      year: e.year,
      semester: e.semester,
      startDate: new Date(e.startDate).toISOString().split('T')[0],
      endDate: new Date(e.endDate).toISOString().split('T')[0],
      daysRemaining: e.daysRemaining,
      isSpecialSalaryGrade: e.isSpecialSalaryGrade ? 'Yes' : 'No',
      basicSalary: e.basicSalary,
      monthlySalaryAsPerContract: e.monthlySalaryAsPerContract,
      dailySalaryAsPerContract: e.dailySalaryAsPerContract,
      monthlyPremium: e.monthlyPremium,
      finalPremium: e.finalPremium,
      bonusType: e.bonusType,
      sss: e.deductions.sss,
      pagibig: e.deductions.pagibig,
      philhealth: e.deductions.philhealth,
      totalDeductions: e.deductions.total,
      employeePhilhealthNo: e.philhealth,
      employeePagibigNo: e.pagibig,
      employeeTin: e.tin
    }));

    const parser = new Parser();
    const csv = parser.parse(data);

    const timestamp = new Date().toISOString().split('T')[0];
    res.header('Content-Type', 'text/csv');
    res.attachment(`active_employees_${timestamp}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Get contract by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id)
      .populate('userId')
      .populate('clauses.clauseId');
    
    if (!contract) {
      return res.status(404).json({ message: 'Contract not found' });
    }
    
    res.json(contract);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Force recalc of holidays/premium for ONE contract, regardless of status.
//
// The automatic refresh (triggered on holiday create/update/delete, see
// routes/holidays.js + utils/contractHolidayRefresh.js) intentionally only
// touches DRAFT/PENDING contracts, to protect already-signed contracts'
// legal snapshot. This endpoint is the deliberate escape hatch for
// admins who need to correct an APPROVED/ACTIVE contract that was
// generated before a holiday existed in the system (e.g. a holiday added
// late, after a contract for that period had already been finalized).
router.post('/:id/recalculate-holidays', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const contract = await Contract.findById(req.params.id);
    if (!contract) {
      return res.status(404).json({ message: 'Contract not found' });
    }

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

    await logActivity({
      actionType: 'UPDATE',
      entityType: 'Contract',
      entityId: contract._id,
      userId: req.user.userId,
      details: `Force-recalculated holidays/premium (₱${oldPremium?.toFixed?.(2)} → ₱${premiumCalc.finalPremium.toFixed(2)})`
    });

    res.json({
      message: 'Contract recalculated',
      oldPremium,
      newPremium: premiumCalc.finalPremium,
      contract
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// backend/routes/contracts.js - CREATE CONTRACT (simplified)

router.post('/', verifyToken, async (req, res) => {
  try {
    if (!['ADMINISTRATOR', 'FOCAL_PERSON'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const {
      userId,
      mode,
      year,
      semester,
      startDate,
      endDate,
      position,
      positionCode,
      placeOfAssignment,
      dutiesAndResponsibilities,
      dutiesNumberingStyle,
      dutiesSubItems,
      salaryGrade,
      charging,
      approverBranch,
      signatories
    } = req.body;

    // PREVENT DUPLICATE CONTRACTS
    // A "duplicate" is the same employee + position + contract period
    // (year + semester) that already has a non-cancelled record. This is
    // the same key used by the stale-draft auto-resolution job and the
    // CSV export's duplicate grouping, so creation, automation, and
    // reporting all agree on what counts as a duplicate.
    const duplicateContract = await Contract.findOne({
      userId,
      position,
      year,
      semester: parseInt(semester),
      status: { $ne: 'CANCELLED' },
      isArchived: false
    }).select('_id contractNumber status').lean();

    if (duplicateContract) {
      return res.status(409).json({
        message: `A contract already exists for this employee, position, and period (${duplicateContract.contractNumber}, status: ${duplicateContract.status}). Cancel or update the existing contract before creating a new one.`,
        existingContract: duplicateContract
      });
    }
    
    // VALIDATE USER PROFILE COMPLETENESS (BACKEND VALIDATION)
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const pi = user.personalInfo || {};
    
    // Check if profile is complete
    const missingFields = [];
    
    // Account Information
    if (!user.username) missingFields.push('Username');
    if (!user.placeOfAssignment) missingFields.push('Place of Assignment');
    
    // Personal Information
    if (!pi.lastName) missingFields.push('Last Name');
    if (!pi.firstName) missingFields.push('First Name');
    // Middle Name intentionally NOT required — some people legitimately
    // have none, and requiring it just encourages placeholder values like
    // "-" or "N/A" that then leak into the generated contract's name line.
    if (!pi.sex) missingFields.push('Sex');
    if (!pi.placeOfBirth) missingFields.push('Place of Birth');
    if (!pi.birthday) missingFields.push('Birthday');
    if (!pi.phoneNumber) missingFields.push('Phone Number');
    if (!pi.email) missingFields.push('Email');
    if (!pi.address) missingFields.push('Address');
    if (!pi.highestEducation) missingFields.push('Highest Education');
    if (!pi.bachelorsDegree) missingFields.push("Bachelor's Degree");
    
    // Government IDs
    if (!pi.philhealth) missingFields.push('PhilHealth');
    if (!pi.pagibig) missingFields.push('Pag-IBIG');
    if (!pi.tin) missingFields.push('TIN');
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        message: `User profile is incomplete. Missing required fields: ${missingFields.join(', ')}` 
      });
    }
    
    console.log(`📋 Creating contract for SG: ${salaryGrade}, Period: ${startDate} to ${endDate}`);
    
    // 1. GET SALARY GRADE DATA — pick the set whose period covers the contract start date
    const salaryGradeData = await SalaryGrade.getRateForGradeAndDate(salaryGrade, startDate);

    if (!salaryGradeData) {
      return res.status(404).json({ message: `Salary grade ${salaryGrade} not found` });
    }

    console.log(`✓ Salary Grade ${salaryGrade} found — using period ${new Date(salaryGradeData.periodStartDate).toISOString().split('T')[0]} → ${salaryGradeData.periodEndDate ? new Date(salaryGradeData.periodEndDate).toISOString().split('T')[0] : 'open'} for contract start ${startDate}`);
    
    // 2. GET HOLIDAYS for entire months in contract period
    const contractStart = new Date(startDate);
    const contractEnd = new Date(endDate);

    // Get first day of start month and last day of end month
    const firstDayOfStartMonth = new Date(contractStart.getFullYear(), contractStart.getMonth(), 1);
    const lastDayOfEndMonth = new Date(contractEnd.getFullYear(), contractEnd.getMonth() + 1, 0);

    const holidays = await resolveHolidaysInRange(firstDayOfStartMonth, lastDayOfEndMonth);

    console.log(`✓ Found ${holidays.length} holidays in full months (${firstDayOfStartMonth.toISOString().split('T')[0]} to ${lastDayOfEndMonth.toISOString().split('T')[0]})`);
    
    // 3. CALCULATE PREMIUM based on working days (ONLY calculation done by system)
    const premiumCalc = calculatePremiumBreakdown({
      monthlyPremium: salaryGradeData.monthlyPremium,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      holidays,
      semester: parseInt(semester)
    });
    
    console.log(`✓ Final Premium Calculated: ₱${premiumCalc.finalPremium.toFixed(2)}`);
    console.log(`  - Total Working Days: ${premiumCalc.totalWorkingDays}`);
    console.log(`  - Full Months: ${premiumCalc.fullMonths}, Partial: ${premiumCalc.partialMonths}`);
    
    // 4. GET POSITION CLAUSES (live-resolved: individual + current contents
    //    of any linked clause groups — see clauseResolver.js)
    const positionData = await Position.findOne({ positionCode });

    let clauses = [];
    if (positionData) {
      const resolvedClauseDocs = await resolvePositionClauses(positionData);
      clauses = resolvedClauseDocs.map(c => ({
        clauseId: c._id,
        customContent: c.content
      }));
      console.log(`✓ Loaded ${clauses.length} clauses`);
    }
    
    // 5. CONVERT AMOUNTS TO WORDS
    const basicSalaryInWords = numberToWords(salaryGradeData.basicSalary);
    const monthlySalaryInWords = numberToWords(salaryGradeData.monthlySalaryAsPerContract);
    const dailySalaryInWords = numberToWords(salaryGradeData.dailySalaryAsPerContract);
    const monthlyPremiumInWords = numberToWords(salaryGradeData.monthlyPremium);
    const finalPremiumInWords = numberToWords(premiumCalc.finalPremium);
    
    // Calculate total deductions
    const totalDeductions = 
      salaryGradeData.deductions.sss + 
      salaryGradeData.deductions.pagibig + 
      salaryGradeData.deductions.philhealth;
    
    // 6. CREATE CONTRACT
    const newContract = new Contract({
      userId,
      mode,
      year,
      semester: parseInt(semester),
      startDate,
      endDate,
      position,
      positionCode,
      placeOfAssignment,
      dutiesAndResponsibilities,
      dutiesNumberingStyle: dutiesNumberingStyle || 'LETTER',
      dutiesSubItems: dutiesSubItems || [],
      salaryGrade,
      isSpecialSalaryGrade: salaryGradeData.isSpecialSalaryGrade,
      
      // Copy all data from salary grade (no calculation)
      basicSalary: salaryGradeData.basicSalary,
      basicSalaryInWords,
      grossPremium: salaryGradeData.grossPremium,
      deductions: {
        sss: salaryGradeData.deductions.sss,
        pagibig: salaryGradeData.deductions.pagibig,
        philhealth: salaryGradeData.deductions.philhealth,
        total: totalDeductions
      },
      monthlySalaryAsPerContract: salaryGradeData.monthlySalaryAsPerContract,
      monthlySalaryAsPerContractInWords: monthlySalaryInWords,
      dailySalaryAsPerContract: salaryGradeData.dailySalaryAsPerContract,
      dailySalaryAsPerContractInWords: dailySalaryInWords,
      monthlyPremium: salaryGradeData.monthlyPremium,
      monthlyPremiumInWords,
      
      // Calculated premium (ONLY calculation)
      finalPremium: premiumCalc.finalPremium,
      finalPremiumInWords,
      bonusType: premiumCalc.bonusType,
      
      // Working days breakdown for audit
      workingDaysBreakdown: premiumCalc.premiumBreakdown,
      
      // Premium summary
      premiumSummary: {
        totalMonths: premiumCalc.totalMonths,
        fullMonths: premiumCalc.fullMonths,
        partialMonths: premiumCalc.partialMonths,
        totalWorkingDays: premiumCalc.totalWorkingDays
      },
      
      charging,
      approverBranch,
      signatories,
      clauses,
      generatedBy: req.user.userId,
      generatedDate: new Date()
    });
    
    await newContract.save();

    // Get the user info for notifications
    // const user = await User.findById(userId);

    // Log the activity
    await logActivity({
      actionType: 'CREATE',
      entityType: 'Contract',
      entityId: newContract._id,
      entityName: `${newContract.contractNumber} - ${user.personalInfo?.firstName || user.username} - ${newContract.position}`,
      performedBy: req.user.userId,
      changesAfter: {
        contractNumber: newContract.contractNumber,
        userId: newContract.userId,
        position: newContract.position,
        startDate: newContract.startDate,
        endDate: newContract.endDate,
        status: newContract.status
      },
      req
    });

    // Update user contract history
    await User.findByIdAndUpdate(userId, {
      $push: {
        contractHistory: {
          contractId: newContract._id,
          mode,
          startDate,
          endDate,
          position,
          status: 'ACTIVE'
        }
      }
    });
    
    res.status(201).json(newContract);
  } catch (error) {
    console.error('❌ Contract creation error:', error);
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Update contract
router.put('/:id', verifyToken, async (req, res) => {
  try {
    if (!['ADMINISTRATOR', 'FOCAL_PERSON'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const contract = await Contract.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    ).populate('userId').populate('clauses.clauseId');
    
    if (!contract) {
      return res.status(404).json({ message: 'Contract not found' });
    }
    
    res.json(contract);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Delete contract
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const contract = await Contract.findByIdAndDelete(req.params.id);
    if (!contract) {
      return res.status(404).json({ message: 'Contract not found' });
    }
    
    res.json({ message: 'Contract deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Fixed PDF Generation Route - Replace the GET /:id/generate route

router.get('/:id/generate', verifyToken, async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id)
      .populate('userId', 'personalInfo placeOfAssignment username')
      .populate({
        path: 'clauses.clauseId',
        select: 'clauseNumber sortOrder title content clauseType isBeforeWitnesseth isFixed variables'
      });
   
    if (!contract) {
      return res.status(404).json({ message: 'Contract not found' });
    }

    // EXPIRED, TERMINATED, and CANCELLED contracts can no longer be
    // previewed or have their PDF (re)generated — in every one of these
    // states the contract is no longer a live, signable agreement (the
    // period is over, it was cut short, or it never took effect), so the
    // generated document is no longer valid for signing. Uploading an
    // already signed/approved contract file (upload-signed route) is
    // unaffected and remains allowed regardless of status.
    const BLOCKED_GENERATION_STATUSES = ['EXPIRED', 'TERMINATED', 'CANCELLED'];
    if (BLOCKED_GENERATION_STATUSES.includes(contract.status)) {
      const reason = {
        EXPIRED: 'has expired',
        TERMINATED: 'has been terminated',
        CANCELLED: 'has been cancelled'
      }[contract.status];
      return res.status(403).json({
        message: `This contract ${reason}. Preview and PDF generation are disabled. You may still upload the signed/approved contract document.`
      });
    }
   
    console.log(`📄 Generating PDF for contract ${contract.contractNumber}`);
    console.log(` Clauses to include: ${contract.clauses?.length || 0}`);
   
    const user = contract.userId;
    const pi = user.personalInfo;
   
    // LaTeX escape function
    const escapeLatex = (text) => {
      if (!text) return '';
      return String(text)
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/[&%$#_{}]/g, '\\$&')
        .replace(/~/g, '\\textasciitilde{}')
        .replace(/\^/g, '\\textasciicircum{}');
    };
   
    // Format functions
    const formatDate = (date) => {
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: '2-digit'
      }).toUpperCase();
    };
    
    const formatAmount = (amount) => {
      const formatted = Number(amount).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      return `PHP ${formatted}`;
    };
    
    // Text wrapping
    const wrapLongText = (text, maxLength = 90) => {
      if (!text || text.length <= maxLength) return text;
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';
      words.forEach(word => {
        if ((currentLine + ' ' + word).length <= maxLength) {
          currentLine += (currentLine ? ' ' : '') + word;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      });
      if (currentLine) lines.push(currentLine);
      return lines.join('\n');
    };
    
    // Build full name
    const getMiddleInitial = (personalInfo) => {
      const middleInitial = normalizeMiddleName(personalInfo.middleInitial);
      if (middleInitial) {
        return middleInitial.toUpperCase();
      }
      const middleName = normalizeMiddleName(personalInfo.middleName);
      if (middleName) {
        return middleName.charAt(0).toUpperCase();
      }
      return '';
    };

    const middleInitial = getMiddleInitial(pi);
    const fullName = `${pi.firstName.toUpperCase()} ${middleInitial ? middleInitial + '. ' : ''}${pi.lastName.toUpperCase()}${pi.suffix ? ', ' + pi.suffix.toUpperCase() : ''}`;
    const address = pi.address.toUpperCase();
   
    // Get signatories with defaults
    const firstParty = contract.signatories.firstParty || {
      name: 'NILO B. TAMORIA',
      position: 'REGIONAL EXECUTIVE DIRECTOR',
      title: 'CESO III'
    };
    const approver = contract.signatories.approver || {
      name: 'ATTY. LIEZL E. DE MESA',
      position: 'OIC, Assistant Regional Director for Management Services'
    };
    const accountant = contract.signatories.accountant || {
      name: 'JEANELYN L. GURO-ARIASO',
      position: 'Chief, Accounting Section'
    };
    const finance = contract.signatories.financeChief || {
      name: 'MABEL C. GRASPARIL',
      position: 'Chief, Finance Division'
    };
    
    // Get current timestamp — explicitly in Manila time so the printed
    // "Generated on" date/time is correct regardless of the server's host
    // timezone (e.g. a UTC production server).
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      timeZone: 'Asia/Manila',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).toUpperCase();
    
    // Preserve the order clauses were assigned to the position/contract — the array
    // order IS the intended render order (set when admin built the position from clause groups).
    // Sorting by sortOrder/clauseNumber here would override the admin's explicit ordering.
    const sortedClauses = contract.clauses
      .filter(clause => clause.clauseId);

    console.log(` Sorted clauses: ${sortedClauses.length}`);

    let clausesContent = '';
    sortedClauses.forEach((clause) => {
    // Use the snapshotted content (customContent) captured at contract creation time.
    // This preserves the clause wording exactly as it was when the contract was issued,
    // even if the clause has since been edited. Fall back to live content only if no
    // snapshot exists (e.g. very old contracts created before snapshotting was introduced).
    let rawContent = clause.customContent || (clause.clauseId && clause.clauseId.content) || '';
    
    if (!rawContent.trim()) {
      console.warn(` ⚠️ Empty content for clause ${clause.clauseId?.clauseNumber}`);
      return;
    }

    // Handle duties placeholder FIRST
    if (rawContent.includes('{dutiesAndResponsibilities}')) {
      const dutiesText = buildDutiesLatex({
        duties: contract.dutiesAndResponsibilities,
        subItems: contract.dutiesSubItems,
        style: contract.dutiesNumberingStyle,
        escapeLatex,
        wrapLongText
      });
      rawContent = rawContent.replace(/\{dutiesAndResponsibilities\}/gi, dutiesText);
    }
    
    // STEP 1: Apply FIRST PARTY/SECOND PARTY markers BEFORE any other processing
    rawContent = rawContent
      .replace(/FIRST PARTY/g, 'XXXXFIRSTPARTYXXXX')
      .replace(/SECOND PARTY/g, 'XXXXSECONDPARTYXXXX')
      .replace(/END OF CONTRACT/g, 'XXXXENDOFCONTRACTXXXX');
    
    // STEP 2: Convert bullet points to LaTeX itemize (markers are preserved)
    rawContent = convertBulletsToLatex(rawContent);

    const paragraphs = rawContent.split('\n\n').filter(p => p.trim());

    let clauseText = '';

    paragraphs.forEach((paragraph, pIndex) => {
      // LaTeX enumerate blocks pass through as-is
      if (paragraph.includes('\\begin{enumerate}') || paragraph.includes('\\begin{itemize}')) {
        if (pIndex > 0 || clauseText) clauseText += '\n\n';
        clauseText += paragraph;
        return;
      }
    
      const lines = paragraph.split('\n').map(l => l.trim()).filter(l => l);
      const hasSubItems = lines.some(line => /^[a-z]\)\s/.test(line));
    
      if (hasSubItems) {
        const mainText = [];
        const subItems = [];
        let inSub = false;
      
        lines.forEach(line => {
          if (/^[a-z]\)\s/.test(line)) {
            inSub = true;
            const match = line.match(/^[a-z]\)\s*(.+)/);
            if (match) subItems.push(wrapLongText(match[1], 85));
          } else if (!inSub) {
            mainText.push(line);
          }
        });
      
        if (mainText.length > 0) {
          let text = wrapLongText(mainText.join(' '), 85);
          text = escapeLatex(text);
          clauseText += text;
        }
      
        if (subItems.length > 0) {
          clauseText += '\n\\begin{enumerate}[label=\\alph*),leftmargin=0.5in,itemsep=0pt,parsep=0pt,topsep=0pt]\n';
          subItems.forEach(item => {
            let itemText = escapeLatex(item);
            clauseText += `\\item ${itemText}\n`;
          });
          clauseText += '\\end{enumerate}';
        }
      } else {
        if (pIndex > 0 || clauseText) clauseText += '\n\n';
        let text = wrapLongText(lines.join(' '), 85);
        text = escapeLatex(text);
        clauseText += text;
      }
    });
    
    // STEP 3: Replace placeholders AFTER escaping
    clauseText = clauseText
      .replace(/\\\{position\\\}/gi, `\\textbf{${escapeLatex(contract.position.toUpperCase())}}`)
      .replace(/\\\{placeOfAssignment\\\}/gi, `\\textbf{${escapeLatex(contract.placeOfAssignment.toUpperCase())}}`)
      .replace(/\\\{startDate\\\}/gi, `\\textbf{${escapeLatex(formatDate(contract.startDate))}}`)
      .replace(/\\\{endDate\\\}/gi, `\\textbf{${escapeLatex(formatDate(contract.endDate))}}`)
      .replace(/\\\{basicSalary\\\}/gi, `\\textbf{${escapeLatex(formatAmount(contract.basicSalary))}}`)
      .replace(/\\\{basicSalaryInWords\\\}/gi, `\\textbf{${escapeLatex((contract.basicSalaryInWords || '').toUpperCase())}}`)
      .replace(/\\\{monthlySalaryAsPerContract\\\}/gi, `\\textbf{${escapeLatex(formatAmount(contract.monthlySalaryAsPerContract))}}`)
      .replace(/\\\{monthlySalaryAsPerContractInWords\\\}/gi, `\\textbf{${escapeLatex((contract.monthlySalaryAsPerContractInWords || '').toUpperCase())}}`)
      .replace(/\\\{dailySalaryAsPerContract\\\}/gi, `\\textbf{${escapeLatex(formatAmount(contract.dailySalaryAsPerContract))}}`)
      .replace(/\\\{dailySalaryAsPerContractInWords\\\}/gi, `\\textbf{${escapeLatex((contract.dailySalaryAsPerContractInWords || '').toUpperCase())}}`)
      .replace(/\\\{monthlyPremium\\\}/gi, `\\textbf{${escapeLatex(formatAmount(contract.monthlyPremium))}}`)
      .replace(/\\\{monthlyPremiumInWords\\\}/gi, `\\textbf{${escapeLatex((contract.monthlyPremiumInWords || '').toUpperCase())}}`)
      .replace(/\\\{finalPremium\\\}/gi, `\\textbf{${escapeLatex(formatAmount(contract.finalPremium))}}`)
      .replace(/\\\{finalPremiumInWords\\\}/gi, `\\textbf{${escapeLatex((contract.finalPremiumInWords || '').toUpperCase())}}`)
      .replace(/\\\{bonusType\\\}/gi, `\\textbf{${escapeLatex((contract.bonusType || 'Mid-Year').toUpperCase())}}`)
      .replace(/\\\{dutiesAndResponsibilities\\\}/gi, '');

    // STEP 4: Replace FIRST PARTY/SECOND PARTY markers with bold LaTeX AT THE VERY END
    clauseText = clauseText
      .replace(/XXXXFIRSTPARTYXXXX/g, '\\textbf{FIRST PARTY}')
      .replace(/XXXXSECONDPARTYXXXX/g, '\\textbf{SECOND PARTY}')
      .replace(/XXXXENDOFCONTRACTXXXX/g, '\\textbf{END OF CONTRACT}');

    // Use index + 1 for sequential numbering instead of database clauseNumber
    const displayNumber = sortedClauses.indexOf(clause) + 1;
    clausesContent += `\\needspace{5\\baselineskip}\n\\noindent\\textbf{${displayNumber}.} ${clauseText}\n\n`;
    console.log(` ✓ Clause ${displayNumber} (DB #${clause.clauseId.clauseNumber}): ${clause.clauseId.title || 'Untitled'}`);
  });
    
    if (!clausesContent.trim()) {
      throw new Error('No valid clause content found for contract');
    }
    
    // Read template
    const templatePath = path.join(__dirname, '..', 'templates', 'contract-template.tex');
    let latexTemplate = fs.readFileSync(templatePath, 'utf8');
    
    // Replace template placeholders
    latexTemplate = latexTemplate
      .replace(/__GENERATED_DATE__/g, `${dateStr} ${timeStr}`)
      .replace(/__FIRST_PARTY_NAME__/g, escapeLatex(firstParty.name))
      .replace(/__FIRST_PARTY_TITLE__/g, escapeLatex(firstParty.title || ''))
      .replace(/__FIRST_PARTY_POSITION__/g, escapeLatex(firstParty.position))
      .replace(/__SECOND_PARTY_NAME__/g, escapeLatex(fullName))
      .replace(/__SECOND_PARTY_ADDRESS__/g, escapeLatex(address))
      .replace(/__CONTRACT_POSITION__/g, escapeLatex(contract.position))
      .replace(/__APPROVER_NAME__/g, escapeLatex(approver.name))
      .replace(/__APPROVER_POSITION__/g, escapeLatex(approver.position))
      .replace(/__ACCOUNTANT_NAME__/g, escapeLatex(accountant.name))
      .replace(/__ACCOUNTANT_POSITION__/g, escapeLatex(accountant.position))
      .replace(/__FINANCE_CHIEF_NAME__/g, escapeLatex(finance.name))
      .replace(/__FINANCE_CHIEF_POSITION__/g, escapeLatex(finance.position))
      .replace(/__CONTRACT_CLAUSES__/g, clausesContent);
    
    // Setup temp directory
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
   
    const timestamp = Date.now();
    const filename = `contract_${contract.contractNumber}_${timestamp}`;
    const texFilePath = path.join(tempDir, `${filename}.tex`);
    const pdfFilePath = path.join(tempDir, `${filename}.pdf`);
   
    fs.writeFileSync(texFilePath, latexTemplate, 'utf8');
    console.log(` 📝 LaTeX file written: ${texFilePath}`);
   
    // Compile PDF
    try {
      await execPromise(`pdflatex -interaction=nonstopmode -output-directory="${tempDir}" "${texFilePath}"`, {
        cwd: tempDir,
        timeout: 30000
      });
     
      console.log(` ✓ PDF compiled successfully`);
     
      if (fs.existsSync(pdfFilePath)) {
        // Build safe filename
        const downloadFileName = buildSafeFilename(
          pi.lastName,
          pi.firstName,
          normalizeMiddleName(pi.middleInitial) || (normalizeMiddleName(pi.middleName) ? normalizeMiddleName(pi.middleName).charAt(0) : ''),
          pi.suffix
        );

        // Debug logging
        console.log(`✓ Generated filename: "${downloadFileName}"`);

        // Set header: CONTRACT_NUMBER_FULLNAME.pdf
        const contractNum = (contract.contractNumber || 'CONTRACT').toString().replace(/[^a-zA-Z0-9\-_]/g, '_');
        const finalFilename = `${contractNum}_${downloadFileName}.pdf`;
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${finalFilename}"`
        );

        // 🔥 CRITICAL: SEND THE FILE
        res.sendFile(pdfFilePath, (err) => {
          // Cleanup temp files after sending
          try {
            fs.unlinkSync(texFilePath);
            fs.unlinkSync(pdfFilePath);

            const auxFile = path.join(tempDir, `${filename}.aux`);
            const logFile = path.join(tempDir, `${filename}.log`);
            const outFile = path.join(tempDir, `${filename}.out`);

            if (fs.existsSync(auxFile)) fs.unlinkSync(auxFile);
            if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
            if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
          } catch (cleanupErr) {
            console.error('Error cleaning up files:', cleanupErr);
          }

          if (err) {
            console.error('Error sending file:', err);
          }
        });
      } else {
        throw new Error('PDF generation failed - file not created');
      }
    } catch (pdfError) {
      if (fs.existsSync(texFilePath)) fs.unlinkSync(texFilePath);
      if (fs.existsSync(pdfFilePath)) fs.unlinkSync(pdfFilePath);
     
      const logFile = path.join(tempDir, `${filename}.log`);
      let errorDetails = pdfError.message;
      if (fs.existsSync(logFile)) {
        const logContent = fs.readFileSync(logFile, 'utf8');
        const errorMatch = logContent.match(/! .+/g);
        if (errorMatch) errorDetails = errorMatch.join('\n');
      }
      throw new Error(`PDF compilation failed: ${errorDetails}`);
    }
   
  } catch (error) {
    console.error('❌ PDF Generation Error:', error);
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Update the export CSV route to include more fields
router.get('/export/csv', verifyToken, async (req, res) => {
  try {
    const { includeArchived } = req.query;
    
    let query = {};
    if (!includeArchived || includeArchived === 'false') {
      query.isArchived = false;
    }

    const contracts = await Contract.find(query)
      .populate('userId')
      .sort({ createdAt: -1 });
    
    // Group contracts by userId, position, year, and semester to get only the latest
    const latestContractsMap = new Map();
    
    contracts.forEach(contract => {
      const userId = contract.userId?._id?.toString();
      if (!userId) return; // Skip if no userId
      
      const key = `${userId}-${contract.position}-${contract.year}-${contract.semester}`;
      
      // Only keep the first occurrence (latest due to sort by createdAt: -1)
      if (!latestContractsMap.has(key)) {
        latestContractsMap.set(key, contract);
      }
    });
    
    // Convert map values back to array
    const latestContracts = Array.from(latestContractsMap.values());
    
    const data = latestContracts.map(c => ({
      contractNumber: c.contractNumber,
      fullName: c.userId ? `${c.userId.personalInfo.lastName}, ${c.userId.personalInfo.firstName} ${normalizeMiddleName(c.userId.personalInfo.middleName)}`.trim() : 'N/A',
      position: c.position?.toUpperCase() || 'N/A',
      placeOfAssignment: c.placeOfAssignment,
      mode: c.mode,
      year: c.year,
      semester: c.semester === 1 ? 'First' : 'Second',
      startDate: c.startDate.toISOString().split('T')[0],
      endDate: c.endDate.toISOString().split('T')[0],
      salaryGrade: c.salaryGrade,
      isSpecialSalaryGrade: c.isSpecialSalaryGrade ? 'Yes' : 'No',
      basicSalary: c.basicSalary,
      monthlySalaryAsPerContract: c.monthlySalaryAsPerContract,
      dailySalaryAsPerContract: c.dailySalaryAsPerContract,
      monthlyPremium: c.monthlyPremium,
      finalPremium: c.finalPremium || 0,
      bonusType: c.bonusType || 'N/A',
      workingDays: c.premiumSummary?.totalWorkingDays || 0,
      philhealth: c.userId?.personalInfo?.philhealth || 'N/A',
      pagibig: c.userId?.personalInfo?.pagibig || 'N/A',
      tin: c.userId?.personalInfo?.tin || 'N/A',
      status: c.status,
      hasSignedContract: c.signedContractFile ? 'Yes' : 'No',
      isArchived: c.isArchived ? 'Yes' : 'No',
      createdAt: c.createdAt.toISOString().split('T')[0]
    }));
    
    const parser = new Parser();
    const csv = parser.parse(data);
    
    const timestamp = new Date().toISOString().split('T')[0];
    res.header('Content-Type', 'text/csv');
    res.attachment(`contracts_export_${timestamp}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});


// Update contract status
// Update contract status
router.patch('/:id/status', verifyToken, async (req, res) => {
  try {
    const { status } = req.body;
    
      if (!['DRAFT', 'PENDING', 'APPROVED', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Only admins and focal persons can change status
    if (!['ADMINISTRATOR', 'FOCAL_PERSON'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const contract = await Contract.findById(req.params.id).populate('userId');
    if (!contract) {
      return res.status(404).json({ message: 'Contract not found' });
    }

    // Store old status before updating
    const oldStatus = contract.status;
    const newStatus = status;

    // Update status
    contract.status = newStatus;
    contract.updatedAt = new Date();
    await contract.save();

    // Log the activity
    await logActivity({
      actionType: 'UPDATE',
      entityType: 'Contract',
      entityId: contract._id,
      entityName: `${contract.contractNumber} - Status Changed`,
      performedBy: req.user.userId,
      changesBefore: { status: oldStatus },
      changesAfter: { status: newStatus },
      req
    });

    console.log(`✓ Contract ${contract.contractNumber} status changed to ${status}`);
    res.json(contract);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Upload signed contract
router.post('/:id/upload-signed', verifyToken, signedContractUpload.single('signedContract'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const contract = await Contract.findById(req.params.id);
    if (!contract) {
      // Delete uploaded R2 file if contract not found
      await deleteFromR2(req.file.key);
      return res.status(404).json({ message: 'Contract not found' });
    }

    // Delete old signed contract file from R2 if exists
    if (contract.signedContractFile?.key) {
      try {
        await deleteFromR2(contract.signedContractFile.key);
      } catch (err) {
        console.warn('Failed to delete old signed contract:', err.message);
      }
    }

    // Build public URL from key — never use file.location (private r2.cloudflarestorage.com endpoint)
    const signedFileUrl = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL}/${req.file.key}`
      : req.file.key;  // key-only fallback; served via backend proxy

    contract.signedContractFile = {
      filename: req.file.key,
      originalName: req.file.originalname,
      key: req.file.key,
      url: signedFileUrl,
      uploadedAt: new Date(),
      uploadedBy: req.user.userId
    };

    // Automatically set status to ACTIVE if uploading signed contract
    if (contract.status === 'APPROVED') {
      contract.status = 'ACTIVE';
    }

    await contract.save();

    console.log(`✓ Signed contract uploaded for ${contract.contractNumber}`);
    res.json({ 
      message: 'Signed contract uploaded successfully',
      contract 
    });
  } catch (error) {
    // Clean up uploaded R2 file on error
    if (req.file?.key) {
      try {
        await deleteFromR2(req.file.key);
      } catch (err) {
        console.warn('Failed to delete uploaded file from R2:', err.message);
      }
    }
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Download signed contract
router.get('/:id/signed-contract', verifyToken, async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id);
    
    if (!contract) {
      return res.status(404).json({ message: 'Contract not found' });
    }

    if (!contract.signedContractFile?.url) {
      return res.status(404).json({ message: 'No signed contract file found' });
    }

    res.redirect(contract.signedContractFile.url);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Archive contract
router.patch('/:id/archive', verifyToken, async (req, res) => {
  try {
    if (!['ADMINISTRATOR', 'FOCAL_PERSON'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const contract = await Contract.findById(req.params.id);
    if (!contract) {
      return res.status(404).json({ message: 'Contract not found' });
    }

    // Only allow archiving expired, terminated, or cancelled contracts
    if (!['EXPIRED', 'TERMINATED', 'CANCELLED'].includes(contract.status)) {
      return res.status(400).json({ 
        message: 'Only expired, terminated, or cancelled contracts can be archived' 
      });
    }

    contract.isArchived = true;
    contract.archivedAt = new Date();
    contract.archivedBy = req.user.userId;
    await contract.save();

    console.log(`✓ Contract ${contract.contractNumber} archived`);
    res.json({ message: 'Contract archived successfully', contract });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Unarchive contract
router.patch('/:id/unarchive', verifyToken, async (req, res) => {
  try {
    if (!['ADMINISTRATOR', 'FOCAL_PERSON'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const contract = await Contract.findByIdAndUpdate(
      req.params.id,
      { 
        isArchived: false,
        archivedAt: null,
        archivedBy: null
      },
      { new: true }
    );

    if (!contract) {
      return res.status(404).json({ message: 'Contract not found' });
    }

    console.log(`✓ Contract ${contract.contractNumber} unarchived`);
    res.json({ message: 'Contract unarchived successfully', contract });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Delete contract (admin only)
// Delete contract (admin only)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ message: 'Access denied. Administrator only.' });
    }
    
    const contract = await Contract.findById(req.params.id);
    if (!contract) {
      return res.status(404).json({ message: 'Contract not found' });
    }

    // Store contract info before deletion
    const contractInfo = {
      contractNumber: contract.contractNumber,
      position: contract.position,
      userId: contract.userId
    };

    // Log the activity BEFORE deletion
    await logActivity({
      actionType: 'DELETE',
      entityType: 'Contract',
      entityId: contract._id,
      entityName: `${contractInfo.contractNumber}`,
      performedBy: req.user.userId,
      changesBefore: contractInfo,
      req
    });

    // Delete signed contract file if exists
    if (contract.signedContractFile?.key) {
      try {
        await deleteFromR2(contract.signedContractFile.key);
      } catch (err) {
        console.warn('Failed to delete signed contract file:', err.message);
      }
    }

    // Delete the contract
    await Contract.findByIdAndDelete(req.params.id);
    
    console.log(`✓ Contract ${contract.contractNumber} deleted`);
    res.json({ message: 'Contract deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});


export default router;