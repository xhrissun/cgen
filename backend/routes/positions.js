import mongoose from 'mongoose';
import express from 'express';
import Position from '../models/Position.js';
import SalaryGrade from '../models/SalaryGrade.js';
import Clause from '../models/Clause.js';
import ClauseGroup from '../models/ClauseGroup.js';
import User from '../models/User.js';
import { verifyToken } from './auth.js';
import Notification from '../models/Notification.js';
import { logActivity } from '../utils/activityLogger.js';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageBreak
} from 'docx';

const router = express.Router();

// ⚠️ IMPORTANT: Specific routes MUST come BEFORE dynamic routes like /:id

// Salary Grades Routes (specific paths first)
router.get('/salary-grades/all', verifyToken, async (req, res) => { 
  try {
    const salaryGrades = await SalaryGrade.find().lean();
    
    // Sort numerically by grade
    salaryGrades.sort((a, b) => {
      const gradeA = parseFloat(a.grade);
      const gradeB = parseFloat(b.grade);
      return gradeA - gradeB;
    });
    
    res.json(salaryGrades);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get salary grade by grade value (e.g., "10", "6.5")
router.get('/salary-grades/:grade', verifyToken, async (req, res) => {
  try {
    const gradeParam = req.params.grade;
    
    // Try to find by string first, then by number
    let salaryGrade = await SalaryGrade.findOne({ grade: gradeParam });
    
    // If not found and the param is a valid number, try as number
    if (!salaryGrade && !isNaN(gradeParam)) {
      salaryGrade = await SalaryGrade.findOne({ grade: parseFloat(gradeParam) });
    }
    
    if (!salaryGrade) {
      return res.status(404).json({ message: `Salary grade ${gradeParam} not found` });
    }
    
    res.json(salaryGrade);
  } catch (error) {
    console.error('Error fetching salary grade:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/salary-grades', verifyToken, async (req, res) => {
  try {
    const newSalaryGrade = new SalaryGrade(req.body);
    await newSalaryGrade.save();
    res.status(201).json(newSalaryGrade);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/salary-grades/:id', verifyToken, async (req, res) => {
  try {
    const salaryGrade = await SalaryGrade.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    res.json(salaryGrade);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/salary-grades/:id', verifyToken, async (req, res) => {
  try {
    // Check if any positions are using this salary grade
    const positionsUsingGrade = await Position.find({ 
      salaryGrade: (await SalaryGrade.findById(req.params.id)).grade 
    });
    
    if (positionsUsingGrade.length > 0) {
      return res.status(400).json({ 
        message: `Cannot delete salary grade. It is currently used by ${positionsUsingGrade.length} position(s).`,
        positions: positionsUsingGrade.map(p => p.title)
      });
    }
    
    const salaryGrade = await SalaryGrade.findByIdAndDelete(req.params.id);
    
    if (!salaryGrade) {
      return res.status(404).json({ message: 'Salary grade not found' });
    }
    
    res.json({ message: 'Salary grade deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/clauses', verifyToken, async (req, res) => {
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/clauses/:id', verifyToken, async (req, res) => {
  try {
    const clause = await Clause.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    res.json(clause);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/clauses/:id', verifyToken, async (req, res) => {
  try {
    const clause = await Clause.findByIdAndDelete(req.params.id);
    if (!clause) {
      return res.status(404).json({ message: 'Clause not found' });
    }
    res.json({ message: 'Clause deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Bulk reorder clauses — accepts [{ _id, sortOrder }, ...]
// Called after drag-and-drop reorder in the admin UI
router.put('/clauses/reorder', verifyToken, async (req, res) => {
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Reorder clauses within a clause group — accepts { clauseIds: [...ordered _ids] }
router.put('/clause-groups/:id/reorder', verifyToken, async (req, res) => {
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
    res.status(500).json({ message: 'Server error', error: error.message });
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
      error: error.message 
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/clause-groups', verifyToken, async (req, res) => {
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/clause-groups/:id', verifyToken, async (req, res) => {
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/clause-groups/:id', verifyToken, async (req, res) => {
  try {
    const group = await ClauseGroup.findByIdAndDelete(req.params.id);
    
    if (!group) {
      return res.status(404).json({ message: 'Clause group not found' });
    }
    
    res.json({ message: 'Clause group deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DOCX TEMPLATE EXPORT  –  Admin only
// GET /api/positions/clause-groups/:id/template
// Returns a .docx with placeholders instead of real data, one section per
// clause, matching the layout of the real contract generator.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/clause-groups/:id/template', verifyToken, async (req, res) => {
  try {
    // Admin-only guard
    if (req.user.role !== 'ADMINISTRATOR') {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const group = await ClauseGroup.findById(req.params.id).populate({
      path: 'clauses',
      select: 'clauseNumber sortOrder title content clauseType isBeforeWitnesseth isFixed variables'
    });

    if (!group) return res.status(404).json({ message: 'Clause group not found.' });

    // Sort clauses: sortOrder > clauseNumber (mirrors ContractGenerator logic)
    const sorted = [...(group.clauses || [])].sort((a, b) => {
      return (a.sortOrder ?? a.clauseNumber) - (b.sortOrder ?? b.clauseNumber);
    });

    // ── Known dynamic variable placeholders (mirrors contracts.js replacements) ──
    const KNOWN_VARS = {
      position:                         '[POSITION]',
      placeOfAssignment:                '[PLACE OF ASSIGNMENT]',
      startDate:                        '[START DATE]',
      endDate:                          '[END DATE]',
      basicSalary:                      '[BASIC SALARY]',
      basicSalaryInWords:               '[BASIC SALARY IN WORDS]',
      monthlySalaryAsPerContract:       '[MONTHLY SALARY AS PER CONTRACT]',
      monthlySalaryAsPerContractInWords:'[MONTHLY SALARY AS PER CONTRACT IN WORDS]',
      dailySalaryAsPerContract:         '[DAILY SALARY AS PER CONTRACT]',
      dailySalaryAsPerContractInWords:  '[DAILY SALARY AS PER CONTRACT IN WORDS]',
      monthlyPremium:                   '[MONTHLY PREMIUM]',
      monthlyPremiumInWords:            '[MONTHLY PREMIUM IN WORDS]',
      finalPremium:                     '[FINAL PREMIUM]',
      finalPremiumInWords:              '[FINAL PREMIUM IN WORDS]',
      bonusType:                        '[BONUS TYPE]',
      dutiesAndResponsibilities:        '[DUTIES AND RESPONSIBILITIES]',
    };

    // Replace {varName} tokens with readable placeholders
    const resolvePlaceholders = (text) => {
      if (!text) return '';
      let out = text;
      for (const [key, label] of Object.entries(KNOWN_VARS)) {
        const re = new RegExp(`\\{${key}\\}`, 'gi');
        out = out.replace(re, label);
      }
      // Catch any remaining {unknownVar} patterns
      out = out.replace(/\{([a-zA-Z_]+)\}/g, (_, name) => `[${name.toUpperCase()}]`);
      return out;
    };

    // ── Build document children ──────────────────────────────────────────────
    const children = [];

    // ── Cover header ─────────────────────────────────────────────────────────
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: 'CONTRACT OF SERVICE', bold: true, size: 32, font: 'Arial' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new TextRun({ text: 'DOCX Template Preview', size: 22, font: 'Arial', color: '888888', italics: true })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: `Clause Group: ${group.name}`, bold: true, size: 24, font: 'Arial', color: '1F4E79' })]
      }),
    );

    if (group.description) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 },
        children: [new TextRun({ text: group.description, size: 20, font: 'Arial', color: '666666', italics: true })]
      }));
    } else {
      children.push(new Paragraph({ spacing: { after: 480 }, children: [] }));
    }

    // ── Party placeholders (mirror contract preamble) ─────────────────────────
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: 'KNOW ALL MEN BY THESE PRESENTS:', bold: true, font: 'Arial', size: 22 })]
      }),
      new Paragraph({
        spacing: { after: 200 },
        indent: { left: 720 },
        children: [
          new TextRun({ text: 'This ', font: 'Arial', size: 22 }),
          new TextRun({ text: 'CONTRACT OF SERVICE', bold: true, font: 'Arial', size: 22 }),
          new TextRun({ text: ' entered into by and between:', font: 'Arial', size: 22 }),
        ]
      }),
    );

    // First party block
    const firstPartyRows = [
      ['Signatory Name:', '[FIRST_PARTY_NAME]'],
      ['Title:', '[FIRST_PARTY_TITLE]'],
      ['Position:', '[FIRST_PARTY_POSITION]'],
    ];

    const border = { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' };
    const borders = { top: border, bottom: border, left: border, right: border };

    children.push(
      new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [new TextRun({ text: 'FIRST PARTY (DENR CALABARZON):', bold: true, font: 'Arial', size: 22, color: '1F4E79' })]
      }),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3000, 6360],
        rows: firstPartyRows.map(([label, val]) =>
          new TableRow({
            children: [
              new TableCell({ borders, width: { size: 3000, type: WidthType.DXA },
                shading: { fill: 'EEF3FA', type: ShadingType.CLEAR },
                margins: { top: 60, bottom: 60, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, font: 'Arial', size: 20 })] })] }),
              new TableCell({ borders, width: { size: 6360, type: WidthType.DXA },
                margins: { top: 60, bottom: 60, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: val, font: 'Arial', size: 20, color: '1F4E79' })] })] }),
            ]
          })
        )
      }),
      new Paragraph({ spacing: { after: 160 }, children: [] }),
    );

    // Second party block
    const secondPartyRows = [
      ['Full Name:', '[SECOND_PARTY_NAME]'],
      ['Address:', '[SECOND_PARTY_ADDRESS]'],
    ];
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [new TextRun({ text: 'SECOND PARTY (Contractual Employee):', bold: true, font: 'Arial', size: 22, color: '1F4E79' })]
      }),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3000, 6360],
        rows: secondPartyRows.map(([label, val]) =>
          new TableRow({
            children: [
              new TableCell({ borders, width: { size: 3000, type: WidthType.DXA },
                shading: { fill: 'EEF3FA', type: ShadingType.CLEAR },
                margins: { top: 60, bottom: 60, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, font: 'Arial', size: 20 })] })] }),
              new TableCell({ borders, width: { size: 6360, type: WidthType.DXA },
                margins: { top: 60, bottom: 60, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: val, font: 'Arial', size: 20, color: '1F4E79' })] })] }),
            ]
          })
        )
      }),
      new Paragraph({ spacing: { after: 400 }, children: [] }),
    );

    // ── Divider heading for clauses ───────────────────────────────────────────
    children.push(
      new Paragraph({
        spacing: { before: 240, after: 240 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2E75B6', space: 1 } },
        children: [new TextRun({ text: `CONTRACT CLAUSES  (${sorted.length} clause${sorted.length !== 1 ? 's' : ''})`, bold: true, size: 26, font: 'Arial', color: '2E75B6' })]
      })
    );

    // ── Render each clause ───────────────────────────────────────────────────
    sorted.forEach((clause, idx) => {
      const displayNum = idx + 1;
      const title = clause.title || `Clause ${clause.clauseNumber}`;
      const rawContent = resolvePlaceholders(clause.content || '');

      // Clause header row
      children.push(
        new Paragraph({
          spacing: { before: 280, after: 80 },
          children: [
            new TextRun({ text: `${displayNum}.  `, bold: true, font: 'Arial', size: 22 }),
            new TextRun({ text: title.toUpperCase(), bold: true, font: 'Arial', size: 22 }),
            ...(clause.clauseType && clause.clauseType !== 'NORMAL'
              ? [new TextRun({ text: `  [${clause.clauseType}]`, font: 'Arial', size: 18, color: '888888', italics: true })]
              : []),
            ...(clause.isFixed ? [new TextRun({ text: '  [FIXED]', font: 'Arial', size: 18, color: 'AA4444', italics: true })] : []),
            ...(clause.isBeforeWitnesseth ? [new TextRun({ text: '  [BEFORE WITNESSETH]', font: 'Arial', size: 18, color: '448844', italics: true })] : []),
          ]
        })
      );

      // Clause body — split on newlines
      const lines = rawContent.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length === 0) {
        children.push(new Paragraph({
          indent: { left: 720 },
          spacing: { after: 120 },
          children: [new TextRun({ text: '(No content)', font: 'Arial', size: 20, italics: true, color: 'AAAAAA' })]
        }));
      } else {
        lines.forEach(line => {
          const isBullet = /^[•\-\*]\s+/.test(line) || /^\d+\.\s+/.test(line);
          const cleanLine = line.replace(/^[•\-\*]\s+/, '').replace(/^\d+\.\s+/, '').trim();
          children.push(new Paragraph({
            indent: { left: isBullet ? 1080 : 720, hanging: isBullet ? 360 : 0 },
            spacing: { after: 60 },
            children: [
              ...(isBullet ? [new TextRun({ text: '•  ', font: 'Arial', size: 20 })] : []),
              new TextRun({ text: cleanLine, font: 'Arial', size: 20 }),
            ]
          }));
        });
      }

      // Variables legend (if any)
      if (clause.variables && clause.variables.length > 0) {
        children.push(
          new Paragraph({ spacing: { before: 100, after: 40 }, children: [new TextRun({ text: 'Variables in this clause:', font: 'Arial', size: 18, italics: true, color: '666666' })] }),
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: [2800, 4560, 2000],
            rows: [
              new TableRow({
                children: [
                  new TableCell({ borders, width: { size: 2800, type: WidthType.DXA }, shading: { fill: 'E8F0FE', type: ShadingType.CLEAR },
                    margins: { top: 40, bottom: 40, left: 100, right: 100 },
                    children: [new Paragraph({ children: [new TextRun({ text: 'Variable', bold: true, font: 'Arial', size: 18 })] })] }),
                  new TableCell({ borders, width: { size: 4560, type: WidthType.DXA }, shading: { fill: 'E8F0FE', type: ShadingType.CLEAR },
                    margins: { top: 40, bottom: 40, left: 100, right: 100 },
                    children: [new Paragraph({ children: [new TextRun({ text: 'Description', bold: true, font: 'Arial', size: 18 })] })] }),
                  new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, shading: { fill: 'E8F0FE', type: ShadingType.CLEAR },
                    margins: { top: 40, bottom: 40, left: 100, right: 100 },
                    children: [new Paragraph({ children: [new TextRun({ text: 'Type', bold: true, font: 'Arial', size: 18 })] })] }),
                ],
              }),
              ...clause.variables.map(v =>
                new TableRow({
                  children: [
                    new TableCell({ borders, width: { size: 2800, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 100, right: 100 },
                      children: [new Paragraph({ children: [new TextRun({ text: `{${v.name}}`, font: 'Courier New', size: 18, color: '1F4E79' })] })] }),
                    new TableCell({ borders, width: { size: 4560, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 100, right: 100 },
                      children: [new Paragraph({ children: [new TextRun({ text: v.description || '—', font: 'Arial', size: 18 })] })] }),
                    new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 100, right: 100 },
                      children: [new Paragraph({ children: [new TextRun({ text: v.dataType || 'TEXT', font: 'Arial', size: 18 })] })] }),
                  ]
                })
              )
            ]
          }),
        );
      }

      children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
    });

    // ── Signature block ────────────────────────────────────────────────────────
    children.push(
      new Paragraph({ spacing: { before: 480, after: 120 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: '2E75B6', space: 1 } },
        children: [new TextRun({ text: 'SIGNATURES', bold: true, size: 24, font: 'Arial', color: '2E75B6' })] }),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [4680, 4680],
        rows: [
          new TableRow({
            children: [
              new TableCell({ borders: { top: border, bottom: border, left: border, right: border }, width: { size: 4680, type: WidthType.DXA },
                margins: { top: 120, bottom: 240, left: 180, right: 180 },
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '[FIRST_PARTY_NAME]', bold: true, font: 'Arial', size: 20, color: '1F4E79' })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '[FIRST_PARTY_TITLE]', font: 'Arial', size: 18, italics: true })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'FIRST PARTY', font: 'Arial', size: 18, bold: true })] }),
                ] }),
              new TableCell({ borders: { top: border, bottom: border, left: border, right: border }, width: { size: 4680, type: WidthType.DXA },
                margins: { top: 120, bottom: 240, left: 180, right: 180 },
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '[SECOND_PARTY_NAME]', bold: true, font: 'Arial', size: 20, color: '1F4E79' })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Contractual Employee', font: 'Arial', size: 18, italics: true })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'SECOND PARTY', font: 'Arial', size: 18, bold: true })] }),
                ] }),
            ]
          }),
        ]
      }),
    );

    // ── Pack document ─────────────────────────────────────────────────────────
    const doc = new Document({
      styles: {
        default: { document: { run: { font: 'Arial', size: 22 } } }
      },
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
        children
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const safeName = group.name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 60) || 'template';
    const filename = `${safeName}_template.docx`;

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  } catch (error) {
    console.error('Error generating clause group template:', error);
    res.status(500).json({ message: 'Failed to generate template.', error: error.message });
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
    res.status(500).json({ message: 'Server error', error: error.message });
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/', verifyToken, async (req, res) => {
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', verifyToken, async (req, res) => {
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
    
    res.json(position);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const position = await Position.findByIdAndDelete(req.params.id);
    
    if (!position) {
      return res.status(404).json({ message: 'Position not found' });
    }
    
    res.json({ message: 'Position deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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