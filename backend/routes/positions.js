// FILE: cgen-main/backend/routes/positions.js

import mongoose from 'mongoose';
import express from 'express';
import { errDetail } from '../utils/errors.js';
import Position from '../models/Position.js';
import SalaryGrade from '../models/SalaryGrade.js';
import Clause from '../models/Clause.js';
import ClauseGroup from '../models/ClauseGroup.js';
import User from '../models/User.js';
import { verifyToken, requireRole } from './auth.js';
import Notification from '../models/Notification.js';
import { logActivity } from '../utils/activityLogger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const execPromise = promisify(exec);

const router = express.Router();

// ⚠️ IMPORTANT: Specific routes MUST come BEFORE dynamic routes like /:id

// Salary Grades Routes (specific paths first)
// ─────────────────────────────────────────────────────────────────────────────
// SALARY GRADE ROUTES  (period/set-based)
//
// A "set" = all grade rows that share the same periodStartDate + periodEndDate.
// When you add a new set, every grade in it gets those dates.
// Contract generation picks the set whose period covers the contract start date.
// ─────────────────────────────────────────────────────────────────────────────

// GET all grades — optionally filtered by ?periodStart=YYYY-MM-DD
// If no filter, returns the ACTIVE set (today falls within the period).
// If ?all=true, returns every document grouped by period.
router.get('/salary-grades/all', verifyToken, async (req, res) => {
  try {
    const { periodStart, all } = req.query;

    const sortByGrade = (docs) => {
      return docs.sort((a, b) => {
        const aNum = parseFloat(a.grade);
        const bNum = parseFloat(b.grade);
        const aIsNum = !isNaN(aNum);
        const bIsNum = !isNaN(bNum);
        // Numeric grades first, sorted ascending; non-numeric (e.g. LR-RIZAL) go to the end, sorted alphabetically
        if (aIsNum && bIsNum) return aNum - bNum;
        if (aIsNum) return -1;
        if (bIsNum) return 1;
        return String(a.grade).localeCompare(String(b.grade));
      });
    };

    if (all === 'true') {
      const docs = await SalaryGrade.find().lean();
      return res.json(sortByGrade(docs));
    }

    let docs;

    if (periodStart) {
      // Return the set that starts on the given date
      docs = await SalaryGrade.find({ periodStartDate: new Date(periodStart) }).lean();
    } else {
      // Default: show the set with the most recent (latest) periodStartDate
      const latest = await SalaryGrade.find().sort({ periodStartDate: -1 }).limit(1).lean();
      if (latest.length) {
        docs = await SalaryGrade.find({ periodStartDate: latest[0].periodStartDate }).lean();
      } else {
        docs = [];
      }
    }

    res.json(sortByGrade(docs));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// GET list of all distinct periods (for the period switcher in the UI)
router.get('/salary-grades/periods', verifyToken, async (req, res) => {
  try {
    const periods = await SalaryGrade.aggregate([
      {
        $group: {
          _id: '$periodStartDate',
          periodStartDate: { $first: '$periodStartDate' },
          periodEndDate:   { $first: '$periodEndDate' },
          periodLabel:     { $first: '$periodLabel' },
          count:           { $sum: 1 }
        }
      },
      { $sort: { periodStartDate: -1 } }
    ]);
    res.json(periods);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// GET salary grade by grade value for the active period (used by contract generator preview)
router.get('/salary-grades/:grade', verifyToken, async (req, res) => {
  try {
    // grade is always stored as String after normalization
    const gradeParam = String(req.params.grade).trim();

    // Use contractDate query param when provided (for advance contract drafting),
    // otherwise fall back to today. This ensures a contract starting July 2, 2026
    // correctly picks up the July 1, 2026 salary grade period instead of the
    // current (pre-July 1) period.
    const referenceDate = req.query.contractDate
      ? new Date(req.query.contractDate)
      : new Date();

    // Find the salary grade period that covers the reference date
    let salaryGrade = await SalaryGrade.findOne({
      grade: gradeParam,
      periodStartDate: { $lte: referenceDate },
      $or: [{ periodEndDate: null }, { periodEndDate: { $gte: referenceDate } }]
    });

    // Fallback: most recent period regardless of date
    if (!salaryGrade) {
      salaryGrade = await SalaryGrade.findOne({ grade: gradeParam }).sort({ periodStartDate: -1 });
    }

    if (!salaryGrade) {
      return res.status(404).json({ message: `Salary grade ${gradeParam} not found` });
    }

    res.json(salaryGrade);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// POST /salary-grades/bulk — saves an entire set of grade rows at once.
// Body: { grades: [...], periodStartDate, periodEndDate, periodLabel }
// Before inserting, closes the previous active period's endDate to the day before
// the new period starts (so there are no gaps or overlaps).
// NOTE: This route MUST be declared before POST /salary-grades to avoid Express
// matching '/bulk' as the /:grade param on the GET route and to keep routing unambiguous.
router.post('/salary-grades/bulk', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const { grades, periodStartDate, periodEndDate, periodLabel } = req.body;

    if (!periodStartDate) {
      return res.status(400).json({ message: 'periodStartDate is required.' });
    }
    if (!grades || !grades.length) {
      return res.status(400).json({ message: 'grades array is required.' });
    }

    const newStart = new Date(periodStartDate);
    const newEnd   = periodEndDate ? new Date(periodEndDate) : null;

    // Close the previous open period's endDate to the day before newStart
    const dayBefore = new Date(newStart);
    dayBefore.setDate(dayBefore.getDate() - 1);

    await SalaryGrade.updateMany(
      { periodEndDate: null, periodStartDate: { $lt: newStart } },
      { $set: { periodEndDate: dayBefore } }
    );

    // Insert all grade rows for the new period
    const docs = grades.map(g => {
      const gradeVal = String(g.grade).trim();
      return {
      grade:              gradeVal,
      isSpecialSalaryGrade: g.isSpecialSalaryGrade || false,
      description:        g.description || '',
      periodStartDate:    newStart,
      periodEndDate:      newEnd,
      periodLabel:        periodLabel || '',
      basicSalary:                parseFloat(g.basicSalary),
      grossPremium:               parseFloat(g.grossPremium) || 0,
      deductions: {
        sss:        parseFloat(g.deductions?.sss)        || 475.00,
        pagibig:    parseFloat(g.deductions?.pagibig)    || 400.00,
        philhealth: parseFloat(g.deductions?.philhealth) || 0
      },
      monthlySalaryAsPerContract: parseFloat(g.monthlySalaryAsPerContract),
      dailySalaryAsPerContract:   parseFloat(g.dailySalaryAsPerContract),
      monthlyPremium:             parseFloat(g.monthlyPremium) || 0,
      note: g.note || ''
    };
    });

    const inserted = await SalaryGrade.insertMany(docs);
    res.status(201).json({ message: `${inserted.length} salary grade(s) saved for period starting ${periodStartDate}.`, grades: inserted });
  } catch (error) {
    // Duplicate key: same grade already exists in this period
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'One or more salary grades already exist for this period start date. Use a different Period Start Date or delete the existing set first.',
        error: errDetail(error)
      });
    }
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// POST — add one grade row to a set.
// Body must include periodStartDate (and optionally periodEndDate, periodLabel).
// Also closes any previously open period whose periodStartDate < the new periodStartDate.
router.post('/salary-grades', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const {
      grade, isSpecialSalaryGrade, description,
      basicSalary, grossPremium, deductions,
      monthlySalaryAsPerContract, dailySalaryAsPerContract, monthlyPremium,
      periodStartDate, periodEndDate, periodLabel, note
    } = req.body;

    if (!periodStartDate) {
      return res.status(400).json({ message: 'periodStartDate is required.' });
    }

    // Always store grade as String — covers numeric ("1","10") and named ("LR-RIZAL")
    const gradeValue = String(grade).trim();

    // Use UTC day range to avoid timezone mismatches in date comparison
    const dayStart = new Date(periodStartDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(periodStartDate);
    dayEnd.setUTCHours(23, 59, 59, 999);

    // Check for duplicate — grade is now always String so single query suffices
    const existing = await SalaryGrade.findOne({
      grade: gradeValue,
      periodStartDate: { $gte: dayStart, $lte: dayEnd }
    });
    if (existing) {
      return res.status(409).json({
        message: `Salary Grade ${gradeValue} already exists for the period starting ${periodStartDate}. Switch to "Add to Current Set" mode or use a different Period Start Date.`
      });
    }

    // Close any previously open period whose start is before the new period
    const dayBefore = new Date(dayStart);
    dayBefore.setDate(dayBefore.getDate() - 1);
    dayBefore.setUTCHours(23, 59, 59, 999);

    await SalaryGrade.updateMany(
      { periodEndDate: null, periodStartDate: { $lt: dayStart } },
      { $set: { periodEndDate: dayBefore } }
    );

    const newStart = dayStart;

    const newSalaryGrade = new SalaryGrade({
      grade: gradeValue,
      isSpecialSalaryGrade: isSpecialSalaryGrade || false,
      description: description || '',
      periodStartDate: newStart,
      periodEndDate:   periodEndDate ? new Date(periodEndDate) : null,
      periodLabel:     periodLabel || '',
      basicSalary:                parseFloat(basicSalary),
      grossPremium:               parseFloat(grossPremium) || 0,
      deductions: {
        sss:        parseFloat(deductions?.sss)        || 475.00,
        pagibig:    parseFloat(deductions?.pagibig)    || 400.00,
        philhealth: parseFloat(deductions?.philhealth) || 0
      },
      monthlySalaryAsPerContract: parseFloat(monthlySalaryAsPerContract),
      dailySalaryAsPerContract:   parseFloat(dailySalaryAsPerContract),
      monthlyPremium:             parseFloat(monthlyPremium) || 0,
      note: note || ''
    });

    await newSalaryGrade.save();
    res.status(201).json(newSalaryGrade);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: `Salary Grade ${req.body.grade} already exists for this period. Please run the normalization migration (node backend/scripts/normalizeSalaryGrades.js) to fix legacy data, then retry.`,
        error: errDetail(error)
      });
    }
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// PUT /salary-grades/:id — update a single grade row (rates or period dates)
router.put('/salary-grades/:id', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const doc = await SalaryGrade.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'Salary grade not found' });
    res.json(doc);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// DELETE entire period set by periodStartDate
router.delete('/salary-grades/period/:periodStart', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const result = await SalaryGrade.deleteMany({ periodStartDate: new Date(req.params.periodStart) });
    res.json({ message: `Deleted ${result.deletedCount} grade(s) for period starting ${req.params.periodStart}.` });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// DELETE a single grade row by _id
router.delete('/salary-grades/:id', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const sg = await SalaryGrade.findById(req.params.id);
    if (!sg) return res.status(404).json({ message: 'Salary grade not found' });

    // Check if any positions reference this grade
    const positionsUsingGrade = await Position.find({ salaryGrade: sg.grade });
    if (positionsUsingGrade.length > 0) {
      return res.status(400).json({
        message: `Cannot delete salary grade. It is currently used by ${positionsUsingGrade.length} position(s).`,
        positions: positionsUsingGrade.map(p => p.title)
      });
    }

    await SalaryGrade.findByIdAndDelete(req.params.id);
    res.json({ message: 'Salary grade deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Clauses Routes
router.get('/clauses/all', verifyToken, async (req, res) => {
  try {
    const clauses = await Clause.find().lean();
    // Sort by sortOrder if set, fall back to clauseNumber for legacy records
    clauses.sort((a, b) => {
      const aOrder = a.sortOrder ?? a.clauseNumber;
      const bOrder = b.sortOrder ?? b.clauseNumber;
      return aOrder - bOrder;
    });
    res.json(clauses);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

router.post('/clauses', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    // Auto-assign sortOrder if not provided — append after current max, in steps of 10
    if (req.body.sortOrder === undefined || req.body.sortOrder === null) {
      const last = await Clause.findOne()
        .sort({ sortOrder: -1 })
        .select('sortOrder clauseNumber')
        .lean();
      // Use the higher of sortOrder or clauseNumber to avoid collisions with legacy data
      const lastOrder = last ? Math.max(last.sortOrder ?? 0, last.clauseNumber ?? 0) : 0;
      req.body.sortOrder = lastOrder + 10;
    }
    const newClause = new Clause(req.body);
    await newClause.save();
    res.status(201).json(newClause);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

router.put('/clauses/:id', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const clause = await Clause.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    res.json(clause);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

router.delete('/clauses/:id', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const clause = await Clause.findByIdAndDelete(req.params.id);
    if (!clause) {
      return res.status(404).json({ message: 'Clause not found' });
    }
    res.json({ message: 'Clause deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Bulk reorder clauses — accepts [{ _id, sortOrder }, ...]
// Called after drag-and-drop reorder in the admin UI
router.put('/clauses/reorder', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const { orderedIds } = req.body; // array of clause _ids in new order
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ message: 'orderedIds array is required' });
    }

    // Assign sortOrder in steps of 10 to preserve insertion room
    const bulkOps = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { sortOrder: (index + 1) * 10, updatedAt: new Date() } }
      }
    }));

    await Clause.bulkWrite(bulkOps);
    res.json({ message: 'Clause order saved', count: orderedIds.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Reorder clauses within a clause group — accepts { clauseIds: [...ordered _ids] }
router.put('/clause-groups/:id/reorder', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const { clauseIds } = req.body;
    if (!Array.isArray(clauseIds)) {
      return res.status(400).json({ message: 'clauseIds array is required' });
    }

    const group = await ClauseGroup.findByIdAndUpdate(
      req.params.id,
      { clauses: clauseIds, updatedAt: new Date() },
      { new: true }
    ).populate({
      path: 'clauses',
      select: 'clauseNumber sortOrder title content clauseType'
    });

    if (!group) {
      return res.status(404).json({ message: 'Clause group not found' });
    }

    res.json(group);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Clause Groups Routes (specific path /clause-groups)
router.get('/clause-groups', verifyToken, async (req, res) => {
  try {
    console.log('✅ GET /clause-groups - START');
    console.log('User ID:', req.user.userId);

    // Fetch all groups and populate clauses directly
    const groups = await ClauseGroup.find()
      .populate({
        path: 'clauses',
        select: 'clauseNumber title content clauseType'
      })
      .populate({
        path: 'createdBy',
        select: 'username'
      })
      .sort({ name: 1 })
      .lean();

    console.log('Found groups:', groups.length);

    // Transform the data to match frontend expectations
    const result = groups.map(group => ({
      _id: group._id,
      name: group.name,
      description: group.description || '',
      clauses: group.clauses || [],
      createdBy: group.createdBy || { username: 'Unknown' },
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    }));

    console.log('SUCCESS: Sending', result.length, 'groups');
    res.json(result);
  } catch (error) {
    console.error('❌ FATAL ERROR in /clause-groups:');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error fetching clause groups', 
      error: errDetail(error) 
    });
  }
});

router.get('/clause-groups/:id', verifyToken, async (req, res) => {
  try {
    const group = await ClauseGroup.findById(req.params.id)
      .populate('clauses');
    
    if (!group) {
      return res.status(404).json({ message: 'Clause group not found' });
    }
    
    res.json(group);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

router.post('/clause-groups', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const { name, description, clauses } = req.body;
    
    const newGroup = new ClauseGroup({
      name,
      description,
      clauses,
      createdBy: req.user.userId
    });
    
    await newGroup.save();
    await newGroup.populate('clauses');
    
    res.status(201).json(newGroup);
  } catch (error) {
    console.error('Error creating clause group:', error);
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

router.put('/clause-groups/:id', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const { name, description, clauses } = req.body;
    
    const group = await ClauseGroup.findByIdAndUpdate(
      req.params.id,
      { 
        name, 
        description, 
        clauses,
        updatedAt: new Date() 
      },
      { new: true }
    ).populate('clauses');
    
    if (!group) {
      return res.status(404).json({ message: 'Clause group not found' });
    }
    
    res.json(group);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

router.delete('/clause-groups/:id', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const group = await ClauseGroup.findByIdAndDelete(req.params.id);
    
    if (!group) {
      return res.status(404).json({ message: 'Clause group not found' });
    }
    
    res.json({ message: 'Clause group deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PDF TEMPLATE EXPORT  –  Admin only
// GET /api/positions/clause-groups/:id/template
// Runs the EXACT same LaTeX pipeline as the real contract generator but
// substitutes placeholder text instead of real employee/contract data.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/clause-groups/:id/template', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const group = await ClauseGroup.findById(req.params.id).populate({
      path: 'clauses',
      select: 'clauseNumber sortOrder title content clauseType isBeforeWitnesseth isFixed variables'
    });

    if (!group) return res.status(404).json({ message: 'Clause group not found.' });

    // Preserve the group's array order — this IS the admin's intended render order.
    // Do not re-sort by sortOrder/clauseNumber; that global field is for the clause list
    // view only and should not override the explicit per-group ordering.
    const sortedClauses = [...(group.clauses || [])];

    // ── Helpers copied verbatim from contracts.js ─────────────────────────────
    const escapeLatex = (text) => {
      if (!text) return '';
      return String(text)
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/[&%$#_{}]/g, '\\$&')
        .replace(/~/g, '\\textasciitilde{}')
        .replace(/\^/g, '\\textasciicircum{}');
    };

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

    const convertBulletsToLatexLocal = (text) => {
      if (!text) return '';
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      let result = '';
      let inList = false;
      let listItems = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isBullet = /^[•\-\*]\s+/.test(line) || /^\d+\.\s+/.test(line);
        if (isBullet) {
          if (!inList) { inList = true; listItems = []; }
          listItems.push(line.replace(/^[•\-\*]\s+/, '').replace(/^\d+\.\s+/, '').trim());
        } else {
          if (inList) {
            result += '\n\\begin{itemize}[leftmargin=0.5in,itemsep=2pt,parsep=0pt,topsep=4pt]\n';
            listItems.forEach(item => { result += `\\item ${item}\n`; });
            result += '\\end{itemize}\n\n';
            inList = false; listItems = [];
          }
          result += line + '\n';
        }
      }
      if (inList && listItems.length > 0) {
        result += '\n\\begin{itemize}[leftmargin=0.5in,itemsep=2pt,parsep=0pt,topsep=4pt]\n';
        listItems.forEach(item => { result += `\\item ${item}\n`; });
        result += '\\end{itemize}\n';
      }
      return result.trim();
    };

    // ── Placeholder values used instead of real data ──────────────────────────
    // [ and ] are special in LaTeX (optional args) — use \lbrack / \rbrack
    // These mirror every .replace() call in contracts.js STEP 3
    const lb = '\\lbrack{}';
    const rb = '\\rbrack{}';
    const ph = (label) => `\\textbf{${lb}${label}${rb}}`;
    const PH = {
      position:                          ph('POSITION'),
      placeOfAssignment:                 ph('PLACE OF ASSIGNMENT'),
      startDate:                         ph('START DATE'),
      endDate:                           ph('END DATE'),
      basicSalary:                       ph('BASIC SALARY'),
      basicSalaryInWords:                ph('BASIC SALARY IN WORDS'),
      monthlySalaryAsPerContract:        ph('MONTHLY SALARY AS PER CONTRACT'),
      monthlySalaryAsPerContractInWords: ph('MONTHLY SALARY IN WORDS'),
      dailySalaryAsPerContract:          ph('DAILY SALARY AS PER CONTRACT'),
      dailySalaryAsPerContractInWords:   ph('DAILY SALARY IN WORDS'),
      monthlyPremium:                    ph('MONTHLY PREMIUM'),
      monthlyPremiumInWords:             ph('MONTHLY PREMIUM IN WORDS'),
      finalPremium:                      ph('FINAL PREMIUM'),
      finalPremiumInWords:               ph('FINAL PREMIUM IN WORDS'),
      bonusType:                         ph('BONUS TYPE'),
    };

    // ── Build clausesContent exactly as contracts.js does ────────────────────
    let clausesContent = '';

    sortedClauses.forEach((clause, idx) => {
      let rawContent = clause.content || '';
      if (!rawContent.trim()) return;

      // duties placeholder
      if (rawContent.includes('{dutiesAndResponsibilities}')) {
        const dutiesPlaceholder =
          '\n\\begin{enumerate}[label=\\alph*),leftmargin=0.5in,itemsep=0pt,parsep=0pt,topsep=0pt]\n' +
          '\\item \\lbrack{}DUTY A\\rbrack{};\n' +
          '\\item \\lbrack{}DUTY B\\rbrack{};\n' +
          '\\item \\lbrack{}DUTY C\\rbrack{}; and\n' +
          '\\item \\lbrack{}DUTY D\\rbrack{}.\n' +
          '\\end{enumerate}';
        rawContent = rawContent.replace(/\{dutiesAndResponsibilities\}/gi, dutiesPlaceholder);
      }

      // STEP 1: protect party markers
      rawContent = rawContent
        .replace(/FIRST PARTY/g,    'XXXXFIRSTPARTYXXXX')
        .replace(/SECOND PARTY/g,   'XXXXSECONDPARTYXXXX')
        .replace(/END OF CONTRACT/g, 'XXXXENDOFCONTRACTXXXX');

      // STEP 2: bullets → LaTeX itemize
      rawContent = convertBulletsToLatexLocal(rawContent);

      const paragraphs = rawContent.split('\n\n').filter(p => p.trim());
      let clauseText = '';

      paragraphs.forEach((paragraph, pIndex) => {
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
            clauseText += escapeLatex(wrapLongText(mainText.join(' '), 85));
          }
          if (subItems.length > 0) {
            clauseText += '\n\\begin{enumerate}[label=\\alph*),leftmargin=0.5in,itemsep=0pt,parsep=0pt,topsep=0pt]\n';
            subItems.forEach(item => { clauseText += `\\item ${escapeLatex(item)}\n`; });
            clauseText += '\\end{enumerate}';
          }
        } else {
          if (pIndex > 0 || clauseText) clauseText += '\n\n';
          clauseText += escapeLatex(wrapLongText(lines.join(' '), 85));
        }
      });

      // STEP 3: replace escaped {var} tokens with placeholder text
      clauseText = clauseText
        .replace(/\\\{position\\\}/gi,                          PH.position)
        .replace(/\\\{placeOfAssignment\\\}/gi,                 PH.placeOfAssignment)
        .replace(/\\\{startDate\\\}/gi,                         PH.startDate)
        .replace(/\\\{endDate\\\}/gi,                           PH.endDate)
        .replace(/\\\{basicSalary\\\}/gi,                       PH.basicSalary)
        .replace(/\\\{basicSalaryInWords\\\}/gi,                PH.basicSalaryInWords)
        .replace(/\\\{monthlySalaryAsPerContract\\\}/gi,        PH.monthlySalaryAsPerContract)
        .replace(/\\\{monthlySalaryAsPerContractInWords\\\}/gi, PH.monthlySalaryAsPerContractInWords)
        .replace(/\\\{dailySalaryAsPerContract\\\}/gi,          PH.dailySalaryAsPerContract)
        .replace(/\\\{dailySalaryAsPerContractInWords\\\}/gi,   PH.dailySalaryAsPerContractInWords)
        .replace(/\\\{monthlyPremium\\\}/gi,                    PH.monthlyPremium)
        .replace(/\\\{monthlyPremiumInWords\\\}/gi,             PH.monthlyPremiumInWords)
        .replace(/\\\{finalPremium\\\}/gi,                      PH.finalPremium)
        .replace(/\\\{finalPremiumInWords\\\}/gi,               PH.finalPremiumInWords)
        .replace(/\\\{bonusType\\\}/gi,                         PH.bonusType)
        .replace(/\\\{dutiesAndResponsibilities\\\}/gi,         '');

      // STEP 4: restore party markers
      clauseText = clauseText
        .replace(/XXXXFIRSTPARTYXXXX/g,    '\\textbf{FIRST PARTY}')
        .replace(/XXXXSECONDPARTYXXXX/g,   '\\textbf{SECOND PARTY}')
        .replace(/XXXXENDOFCONTRACTXXXX/g, '\\textbf{END OF CONTRACT}');

      const displayNumber = idx + 1;
      clausesContent += `\\needspace{5\\baselineskip}\n\\noindent\\textbf{${displayNumber}.} ${clauseText}\n\n`;
    });

    if (!clausesContent.trim()) {
      return res.status(400).json({ message: 'No clause content found in this group.' });
    }

    // ── Fill the same LaTeX template used by the real generator ──────────────
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase();

    // Helper: LaTeX-safe bracket placeholder for the .tex header fields
    const tp = (label) => `\\lbrack{}${label}\\rbrack{}`;

    const templatePath = path.join(__dirname, '..', 'templates', 'contract-template.tex');
    let latexTemplate = fs.readFileSync(templatePath, 'utf8');

    latexTemplate = latexTemplate
      .replace(/__GENERATED_DATE__/g,        `${dateStr} ${timeStr} --- TEMPLATE PREVIEW`)
      .replace(/__FIRST_PARTY_NAME__/g,      tp('AUTHORIZED SIGNATORY NAME'))
      .replace(/__FIRST_PARTY_TITLE__/g,     tp('TITLE / CESO RANK'))
      .replace(/__FIRST_PARTY_POSITION__/g,  tp('POSITION / DESIGNATION'))
      .replace(/__SECOND_PARTY_NAME__/g,     tp('EMPLOYEE FULL NAME'))
      .replace(/__SECOND_PARTY_ADDRESS__/g,  tp('EMPLOYEE COMPLETE ADDRESS'))
      .replace(/__CONTRACT_POSITION__/g,     tp('POSITION'))
      .replace(/__APPROVER_NAME__/g,         tp('APPROVER NAME'))
      .replace(/__APPROVER_POSITION__/g,     tp('APPROVER POSITION'))
      .replace(/__ACCOUNTANT_NAME__/g,       tp('ACCOUNTANT NAME'))
      .replace(/__ACCOUNTANT_POSITION__/g,   tp('ACCOUNTANT POSITION'))
      .replace(/__FINANCE_CHIEF_NAME__/g,    tp('FINANCE CHIEF NAME'))
      .replace(/__FINANCE_CHIEF_POSITION__/g,tp('FINANCE CHIEF POSITION'))
      .replace(/__CONTRACT_CLAUSES__/g,      clausesContent);

    // ── Compile PDF (same as contracts.js) ───────────────────────────────────
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const timestamp  = Date.now();
    const safeName   = group.name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 50) || 'template';
    const baseFile   = `template_${safeName}_${timestamp}`;
    const texPath    = path.join(tempDir, `${baseFile}.tex`);
    const pdfPath    = path.join(tempDir, `${baseFile}.pdf`);

    fs.writeFileSync(texPath, latexTemplate, 'utf8');

    try {
      await execPromise(
        `pdflatex -interaction=nonstopmode -output-directory="${tempDir}" "${texPath}"`,
        { cwd: tempDir, timeout: 30000 }
      );

      if (!fs.existsSync(pdfPath)) throw new Error('PDF not created by pdflatex.');

      const downloadName = `${safeName}_TEMPLATE.pdf`;
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);

      res.sendFile(pdfPath, (err) => {
        // cleanup
        [texPath, pdfPath,
          path.join(tempDir, `${baseFile}.aux`),
          path.join(tempDir, `${baseFile}.log`),
          path.join(tempDir, `${baseFile}.out`),
        ].forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} });
        if (err) console.error('Error sending template PDF:', err);
      });

    } catch (pdfErr) {
      [texPath, pdfPath].forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} });
      const logPath = path.join(tempDir, `${baseFile}.log`);
      let details = pdfErr.message;
      if (fs.existsSync(logPath)) {
        const log = fs.readFileSync(logPath, 'utf8');
        const errs = log.match(/! .+/g);
        if (errs) details = errs.join('\n');
      }
      throw new Error(`PDF compilation failed: ${details}`);
    }

  } catch (error) {
    console.error('Error generating clause group template:', error);
    res.status(500).json({ message: 'Failed to generate template.', error: errDetail(error) });
  }
});

// ⚠️ Position routes with dynamic :id - MUST BE LAST
router.get('/', verifyToken, async (req, res) => {
  try {
    let query = {};
    
    // Focal persons can only see positions for their place of assignment
    if (req.user.role === 'FOCAL_PERSON') {
      const user = await User.findById(req.user.userId);
      query.placeOfAssignment = user.placeOfAssignment;
    }
    
    const positions = await Position.find(query)
      .populate('assignedClauses')
      .populate('createdBy', 'username');
    res.json(positions);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// This /:id route catches ANY path that doesn't match routes above
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const position = await Position.findById(req.params.id)
      .populate('assignedClauses');
    
    if (!position) {
      return res.status(404).json({ message: 'Position not found' });
    }
    
    res.json(position);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

router.post('/', verifyToken, requireRole('ADMINISTRATOR', 'FOCAL_PERSON'), async (req, res) => {
  try {
    const {
      title,
      description,
      salaryGrade,
      isSpecialSalaryGrade,
      specialSalaryAmount,
      dutiesAndResponsibilities,
      assignedClauses,
      clauseGroups,
      placeOfAssignment,
      charging,
      premium
    } = req.body;
    
    // For focal persons, force their place of assignment
    let finalPlaceOfAssignment = placeOfAssignment;
    if (req.user.role === 'FOCAL_PERSON') {
      const currentUser = await User.findById(req.user.userId);
      finalPlaceOfAssignment = currentUser.placeOfAssignment;
    }
    
    // Generate position code automatically
    const positionCode = await generatePositionCode(finalPlaceOfAssignment, title);
    
    // Get current user for notifications
    const currentUser = await User.findById(req.user.userId);
    
    // Only admins can assign clauses
    let finalClauses = [];
    if (req.user.role === 'ADMINISTRATOR') {
      finalClauses = [...(assignedClauses || [])];
      
      // If clause groups are provided, add all their clauses
      if (clauseGroups && clauseGroups.length > 0) {
        const groups = await ClauseGroup.find({ _id: { $in: clauseGroups } });
        groups.forEach(group => {
          group.clauses.forEach(clauseId => {
            if (!finalClauses.includes(clauseId.toString())) {
              finalClauses.push(clauseId);
            }
          });
        });
      }
    }
    
    const newPosition = new Position({
      positionCode,
      title,
      description,
      salaryGrade,
      isSpecialSalaryGrade,
      specialSalaryAmount: specialSalaryAmount ? parseFloat(specialSalaryAmount) : undefined, // ← ADD THIS PARSE
      dutiesAndResponsibilities,
      assignedClauses: finalClauses,
      placeOfAssignment: finalPlaceOfAssignment, // Use the forced assignment for focal persons
      charging,
      premium,
      createdBy: req.user.userId,
      needsClauseAssignment: req.user.role !== 'ADMINISTRATOR' && finalClauses.length === 0
    });
    
    await newPosition.save();

    // Log the activity
    await logActivity({
      actionType: 'CREATE',
      entityType: 'Position',
      entityId: newPosition._id,
      entityName: `${title} (${positionCode})`,
      performedBy: req.user.userId,
      changesAfter: {
        positionCode,
        title,
        salaryGrade,
        placeOfAssignment: finalPlaceOfAssignment
      },
      req
    });
    
    // Notify admins if position needs clause assignment
    if (req.user.role === 'FOCAL_PERSON' && finalClauses.length === 0) {
      const admins = await User.find({ role: 'ADMINISTRATOR' });
      const notifications = admins.map(admin => ({
        userId: admin._id,
        type: 'POSITION_NEEDS_CLAUSES',
        title: 'New Position Needs Clause Assignment',
        message: `Position "${title}" (${positionCode}) at ${finalPlaceOfAssignment} created by ${currentUser.personalInfo?.firstName || currentUser.username} needs clause assignment`,
        relatedId: newPosition._id,
        relatedModel: 'Position',
        actionBy: {
          userId: req.user.userId,
          username: currentUser.username,
          role: currentUser.role,
          placeOfAssignment: currentUser.placeOfAssignment
        }
      }));
      
      await Notification.insertMany(notifications);
      console.log(`✓ Notified ${admins.length} admins about new position`);
    }
    
    // Notify finance officers and admins if charging is empty
    if (!charging || charging.trim() === '') {
      const financeAndAdmins = await User.find({ 
        role: { $in: ['FINANCE_OFFICER', 'ADMINISTRATOR'] } 
      });
      
      const chargingNotifications = financeAndAdmins.map(user => ({
        userId: user._id,
        type: 'CHARGING_NEEDED',
        title: 'Charging Required for New Position',
        message: `Position "${title}" (${positionCode}) at ${finalPlaceOfAssignment} created by ${currentUser.personalInfo?.firstName || currentUser.username} needs charging information`,
        relatedId: newPosition._id,
        relatedModel: 'Position',
        actionBy: {
          userId: req.user.userId,
          username: currentUser.username,
          role: currentUser.role,
          placeOfAssignment: currentUser.placeOfAssignment
        }
      }));
      
      await Notification.insertMany(chargingNotifications);
      console.log(`✓ Notified ${financeAndAdmins.length} finance/admins about charging needed`);
    }
    
    res.status(201).json(newPosition);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

router.put('/:id', verifyToken, requireRole('ADMINISTRATOR', 'FOCAL_PERSON'), async (req, res) => {
  try {
    // Fetch the existing position first
    const existingPosition = await Position.findById(req.params.id);
    if (!existingPosition) {
      return res.status(404).json({ message: 'Position not found' });
    }
    
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };

    // Parse specialSalaryAmount if it exists
    if (updateData.specialSalaryAmount) {
      updateData.specialSalaryAmount = parseFloat(updateData.specialSalaryAmount);
    }
    
    // Preserve placeOfAssignment if admin is only updating clauses
    if (req.user.role === 'ADMINISTRATOR' && !req.body.placeOfAssignment) {
      updateData.placeOfAssignment = existingPosition.placeOfAssignment;
    }
    
    // Only admins can modify clause assignments
    if (req.user.role === 'ADMINISTRATOR') {
      // Handle clause groups if provided
      if (req.body.clauseGroups && req.body.clauseGroups.length > 0) {
        const groups = await ClauseGroup.find({ _id: { $in: req.body.clauseGroups } });
        let allClauses = [...(req.body.assignedClauses || [])];
        
        groups.forEach(group => {
          group.clauses.forEach(clauseId => {
            if (!allClauses.includes(clauseId.toString())) {
              allClauses.push(clauseId);
            }
          });
        });
        
        updateData.assignedClauses = allClauses;
        updateData.needsClauseAssignment = allClauses.length === 0;
      }
    } else {
      // Non-admins cannot modify clause assignments
      delete updateData.assignedClauses;
      delete updateData.clauseGroups;
    }
    
    const position = await Position.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('assignedClauses');
    
    if (!position) {
      return res.status(404).json({ message: 'Position not found' });
    }

    // ── Temporal integrity: refresh DRAFT/PENDING contracts for this position ──
    //
    // RULE: Contracts that have NOT yet been signed/approved (DRAFT, PENDING)
    // should always reflect the current position definition — duties, clauses.
    // They have not been legally committed yet so updating them is correct.
    //
    // Contracts in APPROVED, ACTIVE, EXPIRED, TERMINATED, or CANCELLED are
    // NEVER modified — their snapshots are the legal record as of signing date.
    //
    // This covers the scenario: "I created a contract for Jul 2 – Dec 31, then
    // edited the position on Jun 25 (before the contract starts) — the DRAFT
    // contract should reflect the edited position."
    const draftStatuses = ['DRAFT', 'PENDING'];
    const Contract = (await import('../models/Contract.js')).default;

    // Find all unsigned contracts for this positionCode
    const unsignedContracts = await Contract.find({
      positionCode: existingPosition.positionCode,
      status: { $in: draftStatuses }
    });

    if (unsignedContracts.length > 0) {
      // Build clauseId → content map from the updated position
      const clauseContentMap = {};
      if (position.assignedClauses && position.assignedClauses.length > 0) {
        position.assignedClauses.forEach(c => {
          clauseContentMap[c._id.toString()] = c.content;
        });
      }

      // New duties from the updated position
      const newDuties = updateData.dutiesAndResponsibilities || existingPosition.dutiesAndResponsibilities;

      for (const contract of unsignedContracts) {
        let changed = false;

        // 1. Refresh clause content snapshots
        contract.clauses = contract.clauses.map(entry => {
          const idStr = entry.clauseId?.toString();
          if (idStr && clauseContentMap[idStr] !== undefined) {
            const newContent = clauseContentMap[idStr];
            if (entry.customContent !== newContent) {
              changed = true;
              return { ...entry.toObject(), customContent: newContent };
            }
          }
          return entry;
        });

        // 2. Refresh duties and responsibilities
        const dutiesChanged = JSON.stringify(contract.dutiesAndResponsibilities) !== JSON.stringify(newDuties);
        if (dutiesChanged) {
          contract.dutiesAndResponsibilities = newDuties;
          changed = true;
        }

        if (changed) {
          await contract.save();
          console.log(`↺ Refreshed duties+clauses for contract ${contract.contractNumber} (${contract.status})`);
        }
      }
    }

    res.json(position);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

router.delete('/:id', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const position = await Position.findByIdAndDelete(req.params.id);
    
    if (!position) {
      return res.status(404).json({ message: 'Position not found' });
    }
    
    res.json({ message: 'Position deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Helper function to generate position code
const generatePositionCode = async (placeOfAssignment, title) => {
  // Extract abbreviation from place of assignment (first letters of each word)
  const assignmentWords = placeOfAssignment.split(' ').filter(word => 
    // Filter out common words like "AND", "OF", "THE"
    !['AND', 'OF', 'THE', 'FOR', 'IN', 'AT'].includes(word.toUpperCase())
  );
  
  const assignmentAbbr = assignmentWords
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .substring(0, 5); // Increased to 5 characters for longer names
  
  // Extract abbreviation from position title
  const titleWords = title.split(' ').filter(word => 
    // Filter out common words and numbers
    !['AND', 'OF', 'THE', 'FOR', 'IN', 'AT'].includes(word.toUpperCase()) &&
    isNaN(word) // Exclude standalone numbers
  );
  
  let titleAbbr = '';
  
  if (titleWords.length === 1) {
    // Single word: take first 4 characters
    titleAbbr = titleWords[0].substring(0, 4).toUpperCase();
  } else {
    // Multiple words: take first letter or first two letters of each significant word
    titleAbbr = titleWords
      .map((word, index) => {
        // For important words (first 2-3), take up to 2 letters
        if (index < 2) {
          return word.substring(0, 2).toUpperCase();
        }
        return word[0].toUpperCase();
      })
      .join('')
      .substring(0, 4); // Limit to 4 characters
  }
  
  // Handle Roman numerals in title (e.g., "Officer I", "Officer II")
  const romanNumeralMatch = title.match(/\b([IVX]+)\b$/i);
  if (romanNumeralMatch) {
    titleAbbr += romanNumeralMatch[1].toUpperCase();
  }
  
  // Find existing positions with similar codes to determine instance number
  const existingPositions = await Position.find({
    positionCode: new RegExp(`^${assignmentAbbr}-${titleAbbr}`, 'i')
  }).sort({ positionCode: -1 });
  
  let instance = 1;
  if (existingPositions.length > 0) {
    // Extract the highest instance number
    const lastCode = existingPositions[0].positionCode;
    const match = lastCode.match(/-(\d+)$/);
    if (match) {
      instance = parseInt(match[1]) + 1;
    }
  }
  
  return `${assignmentAbbr}-${titleAbbr}-${instance}`;
};

export default router;