// backend/routes/wellnessLeave.js
//
// Wellness Leave under CSC Resolution No. 2501292 (13 Nov 2025) and CSC MC
// No. 01, s. 2026. Endpoints cover:
//   - credit balances (contractual self-view, focal/admin monitoring)
//   - filing an application (no deduction until APPROVED)
//   - supervisor/focal recommendation, ARDMS approval (manual or QR scan)
//   - the printable A5 form (LaTeX -> pdflatex, same approach as
//     contracts.js/positions.js) carrying a QR code for the scan-approve flow
import express from 'express';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import QRCode from 'qrcode';
import { errDetail } from '../utils/errors.js';
import { verifyToken, requireRole } from './auth.js';
import User from '../models/User.js';
import Contract from '../models/Contract.js';
import WellnessLeaveApplication from '../models/WellnessLeaveApplication.js';
import WellnessLeaveCredit from '../models/WellnessLeaveCredit.js';
import { grantWellnessLeaveCredits } from '../utils/wellnessLeaveCredits.js';

const execPromise = promisify(exec);
const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

// ─── Helpers ──────────────────────────────────────────────────────────────

// Balance is computed on the fly: granted (from the year's ledger) minus the
// sum of APPROVED applications for that year. This is what makes "shall not
// be deducted unless approved" automatic — PENDING/RECOMMENDED/DISAPPROVED/
// CANCELLED applications never subtract from it.
async function getBalance(userId, year) {
  const ledger = await WellnessLeaveCredit.findOne({ userId, year }).lean();
  const granted = ledger?.granted || 0;

  const approvedApps = await WellnessLeaveApplication.find({
    userId, year, status: 'APPROVED'
  }).select('daysRequested').lean();

  const used = approvedApps.reduce((sum, a) => sum + (a.daysRequested || 0), 0);
  return { year, granted, used, balance: Math.round((granted - used) * 100) / 100 };
}

// Focal persons may only see/act on users in their own office; admins see all.
async function canManageUser(req, targetUser) {
  if (req.user.role === 'ADMINISTRATOR') return true;
  if (req.user.role === 'FOCAL_PERSON') {
    const me = await User.findById(req.user.userId).select('placeOfAssignment').lean();
    return !!me && targetUser.placeOfAssignment === me.placeOfAssignment;
  }
  return false;
}

async function canViewApplication(req, application) {
  const ownerId = String(application.userId);
  if (req.user.userId === ownerId) return true;
  if (req.user.role === 'ADMINISTRATOR') return true;
  if (req.user.role === 'FOCAL_PERSON') {
    const owner = await User.findById(ownerId).select('placeOfAssignment').lean();
    const me = await User.findById(req.user.userId).select('placeOfAssignment').lean();
    return !!owner && !!me && owner.placeOfAssignment === me.placeOfAssignment;
  }
  return false;
}

function calendarYear(date) {
  return new Date(date).getFullYear();
}

// ─── Credits ──────────────────────────────────────────────────────────────

// Own credit balances, across every year that has a ledger entry.
router.get('/credits/me', verifyToken, async (req, res) => {
  try {
    const ledgers = await WellnessLeaveCredit.find({ userId: req.user.userId }).sort({ year: -1 }).lean();
    const balances = await Promise.all(ledgers.map(l => getBalance(req.user.userId, l.year)));
    res.json(balances);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Whether the caller currently has a contract in force. Used by the
// frontend to disable "Apply for Wellness Leave" up front, mirroring the
// same ACTIVE-contract safeguard enforced server-side on POST /applications.
router.get('/eligibility/me', verifyToken, async (req, res) => {
  try {
    const activeContract = await Contract.findOne({
      userId: req.user.userId,
      status: 'ACTIVE',
      isArchived: false
    }).select('_id').lean();
    res.json({ hasActiveContract: !!activeContract });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Monitoring list for FOCAL_PERSON (own office only) / ADMINISTRATOR (all).
// Query: ?year=2026&placeOfAssignment=... (placeOfAssignment ignored/forced for focal persons)
router.get('/credits', verifyToken, requireRole('ADMINISTRATOR', 'FOCAL_PERSON'), async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();

    let userQuery = { role: 'CONTRACTUAL' };
    if (req.user.role === 'FOCAL_PERSON') {
      const me = await User.findById(req.user.userId).select('placeOfAssignment').lean();
      userQuery.placeOfAssignment = me?.placeOfAssignment;
    } else if (req.query.placeOfAssignment) {
      userQuery.placeOfAssignment = req.query.placeOfAssignment;
    }

    const users = await User.find(userQuery)
      .select('username personalInfo.firstName personalInfo.lastName personalInfo.middleName placeOfAssignment')
      .lean();

    const rows = await Promise.all(users.map(async (u) => {
      const bal = await getBalance(u._id, year);
      return {
        userId: u._id,
        username: u.username,
        fullName: [u.personalInfo?.firstName, u.personalInfo?.middleName, u.personalInfo?.lastName].filter(Boolean).join(' ') || u.username,
        placeOfAssignment: u.placeOfAssignment,
        ...bal
      };
    }));

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Single user's balance across years — focal/admin (scoped) or the user themself.
router.get('/credits/:userId', verifyToken, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId).select('placeOfAssignment').lean();
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    if (req.user.userId !== req.params.userId && !(await canManageUser(req, targetUser))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const ledgers = await WellnessLeaveCredit.find({ userId: req.params.userId }).sort({ year: -1 }).lean();
    const balances = await Promise.all(ledgers.map(l => getBalance(req.params.userId, l.year)));
    res.json(balances);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// One-time (safely re-runnable) backfill: applies the grant rules to every
// existing contract in chronological order, for contracts created before
// this feature existed. Re-running is safe — grantWellnessLeaveCredits is
// idempotent per calendar year (non-cumulative flags prevent double-grants).
router.post('/admin/backfill-credits', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const contracts = await Contract.find({ isArchived: false })
      .select('userId mode year startDate')
      .sort({ startDate: 1 })
      .lean();

    let processed = 0;
    for (const c of contracts) {
      const year = c.year || calendarYear(c.startDate);
      await grantWellnessLeaveCredits({ userId: c.userId, mode: c.mode, year, contractId: c._id });
      processed++;
    }

    res.json({ message: `Backfilled Wellness Leave credits from ${processed} existing contract(s).` });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// ─── Applications ─────────────────────────────────────────────────────────

// File a new application. Does NOT touch credits — only validates that
// enough balance exists for the requested year so an obviously-invalid
// application can't even be filed.
router.post('/applications', verifyToken, requireRole('CONTRACTUAL'), async (req, res) => {
  try {
    const { startDate, endDate, daysRequested, reason } = req.body;

    if (!startDate || !endDate || !daysRequested) {
      return res.status(400).json({ message: 'Start date, end date, and days requested are required.' });
    }
    const days = parseFloat(daysRequested);
    if (!(days > 0)) {
      return res.status(400).json({ message: 'Days requested must be greater than zero.' });
    }

    // Safeguard: only contractuals with a currently-in-force contract may
    // apply. `status: 'ACTIVE'` is kept accurate by the contractExpiry cron
    // (utils/contractExpiry.js), which flips ACTIVE -> EXPIRED the moment
    // endDate passes, so this is a reliable "as of right now" check rather
    // than re-deriving it from raw dates here.
    const activeContract = await Contract.findOne({
      userId: req.user.userId,
      status: 'ACTIVE',
      isArchived: false
    }).lean();
    if (!activeContract) {
      return res.status(403).json({ message: 'You need a current active contract to apply for Wellness Leave.' });
    }

    const year = calendarYear(startDate);
    const { balance } = await getBalance(req.user.userId, year);
    if (days > balance) {
      return res.status(400).json({ message: `Insufficient Wellness Leave balance for ${year}. Available: ${balance} day(s).` });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const fullName = [user.personalInfo?.firstName, user.personalInfo?.middleName, user.personalInfo?.lastName].filter(Boolean).join(' ') || user.username;
    const latestContract = [...(user.contractHistory || [])].sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];

    const application = new WellnessLeaveApplication({
      userId: user._id,
      year,
      startDate,
      endDate,
      daysRequested: days,
      reason: reason || '',
      employeeSnapshot: {
        fullName,
        position: latestContract?.position || '',
        placeOfAssignment: user.placeOfAssignment || '',
        contractMode: latestContract?.mode || ''
      }
    });

    await application.save();
    res.status(201).json(application);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Own applications.
router.get('/applications/me', verifyToken, async (req, res) => {
  try {
    const applications = await WellnessLeaveApplication.find({ userId: req.user.userId }).sort({ createdAt: -1 }).lean();
    res.json(applications);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Monitoring list — focal (own office) / admin (all, optionally filtered).
router.get('/applications', verifyToken, requireRole('ADMINISTRATOR', 'FOCAL_PERSON'), async (req, res) => {
  try {
    const { status, year } = req.query;
    let userIds = null;

    if (req.user.role === 'FOCAL_PERSON') {
      const me = await User.findById(req.user.userId).select('placeOfAssignment').lean();
      const officeUsers = await User.find({ placeOfAssignment: me?.placeOfAssignment }).select('_id').lean();
      userIds = officeUsers.map(u => u._id);
    }

    const query = {};
    if (userIds) query.userId = { $in: userIds };
    if (status) query.status = status;
    if (year) query.year = parseInt(year, 10);

    const applications = await WellnessLeaveApplication.find(query)
      .populate('userId', 'username personalInfo.firstName personalInfo.lastName placeOfAssignment')
      .sort({ createdAt: -1 })
      .lean();

    res.json(applications);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Single application — self, scoped focal, or admin.
router.get('/applications/:id', verifyToken, async (req, res) => {
  try {
    const application = await WellnessLeaveApplication.findById(req.params.id)
      .populate('userId', 'username personalInfo placeOfAssignment');
    if (!application) return res.status(404).json({ message: 'Application not found' });

    if (!(await canViewApplication(req, application))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(application);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Immediate supervisor / focal person recommendation step.
router.patch('/applications/:id/recommend', verifyToken, requireRole('ADMINISTRATOR', 'FOCAL_PERSON'), async (req, res) => {
  try {
    const { action, name, position, remarks } = req.body; // action: 'RECOMMENDED' | 'DISAPPROVED'
    if (!['RECOMMENDED', 'DISAPPROVED'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action.' });
    }

    const application = await WellnessLeaveApplication.findById(req.params.id).populate('userId', 'placeOfAssignment');
    if (!application) return res.status(404).json({ message: 'Application not found' });
    if (application.status !== 'PENDING') {
      return res.status(400).json({ message: `Cannot act on an application with status ${application.status}.` });
    }
    if (!(await canManageUser(req, application.userId))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    application.supervisor = {
      name: name || '',
      position: position || '',
      action,
      remarks: remarks || '',
      actionBy: req.user.userId,
      actionDate: new Date()
    };
    application.status = action;
    await application.save();

    res.json(application);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// ARD for Management Services approval — manual entry (as opposed to the QR
// scan flow below). Administrator-only, since ARDMS acts through Admin.
router.patch('/applications/:id/approve', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const { action, name, remarks } = req.body; // action: 'APPROVED' | 'DISAPPROVED'
    if (!['APPROVED', 'DISAPPROVED'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action.' });
    }

    const application = await WellnessLeaveApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ message: 'Application not found' });
    if (application.status !== 'RECOMMENDED') {
      return res.status(400).json({ message: `Application must be recommended by the immediate supervisor first (current status: ${application.status}).` });
    }

    if (action === 'APPROVED') {
      const { balance } = await getBalance(application.userId, application.year);
      if (application.daysRequested > balance) {
        return res.status(400).json({ message: `Insufficient remaining balance for ${application.year} (${balance} day(s) left).` });
      }
    }

    application.approver = {
      name: name || '',
      position: 'Assistant Regional Director for Management Services',
      action,
      remarks: remarks || '',
      actionBy: req.user.userId,
      actionDate: new Date()
    };
    application.status = action;
    await application.save();

    res.json(application);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Applicant cancels their own not-yet-approved application.
router.patch('/applications/:id/cancel', verifyToken, async (req, res) => {
  try {
    const application = await WellnessLeaveApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ message: 'Application not found' });
    if (String(application.userId) !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (!['PENDING', 'RECOMMENDED'].includes(application.status)) {
      return res.status(400).json({ message: `Cannot cancel an application with status ${application.status}.` });
    }

    application.status = 'CANCELLED';
    application.cancelledAt = new Date();
    application.cancelledBy = req.user.userId;
    await application.save();

    res.json(application);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// ─── QR scan-approve ────────────────────────────────────────────────────
// The printed form's QR encodes {FRONTEND_URL}/wellness-scan/:id/:qrToken.
// The frontend route (admin-only) fetches details via GET .../scan/:id/:token
// then calls POST .../:id/scan-approve to record the approval.

router.get('/applications/scan/:id/:token', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const application = await WellnessLeaveApplication.findById(req.params.id)
      .populate('userId', 'username personalInfo placeOfAssignment');
    if (!application) return res.status(404).json({ message: 'Application not found' });
    if (application.qrToken !== req.params.token) {
      return res.status(403).json({ message: 'Invalid or expired QR code.' });
    }
    res.json(application);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

router.post('/applications/:id/scan-approve', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const { token } = req.body;
    const application = await WellnessLeaveApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ message: 'Application not found' });
    if (application.qrToken !== token) {
      return res.status(403).json({ message: 'Invalid or expired QR code.' });
    }
    if (application.status === 'APPROVED') {
      return res.status(400).json({ message: 'This application has already been marked as approved.' });
    }
    if (application.status !== 'RECOMMENDED') {
      return res.status(400).json({ message: `Application must be recommended by the immediate supervisor first (current status: ${application.status}).` });
    }

    const { balance } = await getBalance(application.userId, application.year);
    if (application.daysRequested > balance) {
      return res.status(400).json({ message: `Insufficient remaining balance for ${application.year} (${balance} day(s) left).` });
    }

    application.approver = {
      name: application.approver?.name || '',
      position: 'Assistant Regional Director for Management Services',
      action: 'APPROVED',
      remarks: application.approver?.remarks || 'Approved via QR verification of signed paper form.',
      actionBy: req.user.userId,
      actionDate: new Date()
    };
    application.status = 'APPROVED';
    application.qrScannedAt = new Date();
    application.qrScannedBy = req.user.userId;
    await application.save();

    res.json(application);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// ─── Printable A5 form ──────────────────────────────────────────────────

const escapeLatex = (text) => {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%$#_{}]/g, '\\$&')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
};

const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

router.get('/applications/:id/form', verifyToken, async (req, res) => {
  let texPath, pdfPath, qrPngPath, tempDir, baseFile;
  try {
    const application = await WellnessLeaveApplication.findById(req.params.id)
      .populate('userId', 'username personalInfo placeOfAssignment');
    if (!application) return res.status(404).json({ message: 'Application not found' });
    if (!(await canViewApplication(req, application))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const timestamp = Date.now();
    baseFile = `wellness_leave_${application.applicationNumber}_${timestamp}`;
    texPath = path.join(tempDir, `${baseFile}.tex`);
    pdfPath = path.join(tempDir, `${baseFile}.pdf`);
    qrPngPath = path.join(tempDir, `${baseFile}_qr.png`);

    // QR encodes the scan-approve landing page for this specific application.
    const scanUrl = `${FRONTEND_URL}/wellness-scan/${application._id}/${application.qrToken}`;
    await QRCode.toFile(qrPngPath, scanUrl, { width: 300, margin: 1 });

    const emp = application.employeeSnapshot || {};
    const sup = application.supervisor || {};
    const app = application.approver || {};

    const latexDoc = `\\documentclass[10pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{times}
\\usepackage[a5paper,margin=0.45in]{geometry}
\\usepackage{graphicx}
\\usepackage{array}
\\usepackage{setspace}
\\pagestyle{empty}

\\begin{document}
\\begin{center}
{\\bfseries\\fontsize{11}{13}\\selectfont Republic of the Philippines}\\\\
{\\fontsize{9}{11}\\selectfont Department of Environment and Natural Resources}\\\\
{\\fontsize{9}{11}\\selectfont Region IV-A --- CALABARZON}\\\\[6pt]
{\\bfseries\\fontsize{12}{14}\\selectfont WELLNESS LEAVE APPLICATION}\\\\[2pt]
{\\fontsize{8}{10}\\selectfont Application No.: ${escapeLatex(application.applicationNumber)}}
\\end{center}
\\vspace{6pt}
\\hrule
\\vspace{8pt}

\\noindent{\\fontsize{8}{11}\\selectfont Pursuant to CSC Resolution No. 2501292 dated 13 November 2025 and CSC Memorandum Circular No. 01, s. 2026 (Wellness Leave Policy).}
\\vspace{8pt}

\\noindent\\begin{tabular}{@{}p{1.3in}p{2.6in}@{}}
\\textbf{Name:} & ${escapeLatex(emp.fullName)} \\\\[3pt]
\\textbf{Position:} & ${escapeLatex(emp.position)} \\\\[3pt]
\\textbf{Place of Assignment:} & ${escapeLatex(emp.placeOfAssignment)} \\\\[3pt]
\\textbf{Inclusive Dates:} & ${escapeLatex(formatDate(application.startDate))} to ${escapeLatex(formatDate(application.endDate))} \\\\[3pt]
\\textbf{Days Requested:} & ${escapeLatex(application.daysRequested)} working day(s) \\\\[3pt]
\\textbf{Reason:} & ${escapeLatex(application.reason || 'N/A')} \\\\
\\end{tabular}

\\vspace{14pt}
\\noindent I certify that the above information is true and correct.
\\vspace{28pt}

\\noindent\\hrulefill\\\\
{\\fontsize{8}{10}\\selectfont Signature of Employee over Printed Name \\hfill Date}

\\vspace{18pt}
\\hrule
\\vspace{8pt}
\\noindent{\\bfseries\\fontsize{9}{11}\\selectfont Recommending Approval}\\\\[4pt]
{\\fontsize{8}{10}\\selectfont Status: ${escapeLatex(sup.action || 'Pending')}${sup.remarks ? ` --- ${escapeLatex(sup.remarks)}` : ''}}
\\vspace{24pt}

\\noindent\\hrulefill\\\\
{\\fontsize{8}{10}\\selectfont Signature of Immediate Supervisor over Printed Name \\hfill Date}

\\vspace{18pt}
\\hrule
\\vspace{8pt}
\\noindent{\\bfseries\\fontsize{9}{11}\\selectfont Approval}\\\\[4pt]
{\\fontsize{8}{10}\\selectfont Status: ${escapeLatex(app.action || 'Pending')}${app.remarks ? ` --- ${escapeLatex(app.remarks)}` : ''}}
\\vspace{24pt}

\\noindent\\hrulefill\\\\
{\\fontsize{8}{10}\\selectfont Assistant Regional Director for Management Services \\hfill Date}

\\vspace{12pt}
\\begin{center}
\\includegraphics[width=0.9in]{${qrPngPath.replace(/\\/g, '/')}}\\\\
{\\fontsize{6.5}{8}\\selectfont Scan to log approval in CGEN once fully signed}
\\end{center}

\\vspace{6pt}
{\\fontsize{6.5}{8}\\selectfont\\itshape Wellness Leave is non-cumulative, non-commutable to its monetary equivalent, and shall be forfeited if not availed of within the contract period.}

\\end{document}
`;

    fs.writeFileSync(texPath, latexDoc, 'utf8');

    await execPromise(
      `pdflatex -interaction=nonstopmode -output-directory="${tempDir}" "${texPath}"`,
      { cwd: tempDir, timeout: 60000 }
    );

    if (!fs.existsSync(pdfPath)) throw new Error('PDF not created by pdflatex.');

    res.setHeader('Content-Disposition', `inline; filename="${application.applicationNumber}.pdf"`);
    res.sendFile(pdfPath, (err) => {
      [texPath, pdfPath, qrPngPath,
        path.join(tempDir, `${baseFile}.aux`),
        path.join(tempDir, `${baseFile}.log`),
        path.join(tempDir, `${baseFile}.out`),
      ].forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} });
      if (err) console.error('Error sending Wellness Leave form PDF:', err);
    });
  } catch (error) {
    [texPath, pdfPath, qrPngPath].forEach(f => { try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} });
    let details = error.message;
    try {
      const logPath = path.join(tempDir, `${baseFile}.log`);
      if (fs.existsSync(logPath)) {
        const log = fs.readFileSync(logPath, 'utf8');
        const errs = log.match(/! .+/g);
        if (errs) details = errs.join('\n');
      }
    } catch (_) {}
    console.error('Error generating Wellness Leave form PDF:', error);
    res.status(500).json({ message: 'Failed to generate Wellness Leave form.', error: errDetail(new Error(details)) });
  }
});

export default router;