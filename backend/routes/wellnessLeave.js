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
// Python/WeasyPrint removed — PDF generation is now done in Node.js via Puppeteer
import QRCode from 'qrcode';
import { errDetail } from '../utils/errors.js';
import { verifyToken, requireRole } from './auth.js';
import User from '../models/User.js';
import Contract from '../models/Contract.js';
import WellnessLeaveApplication from '../models/WellnessLeaveApplication.js';
import WellnessLeaveCredit from '../models/WellnessLeaveCredit.js';
import { grantWellnessLeaveCredits } from '../utils/wellnessLeaveCredits.js';
import { generateWellnessLeavePdf } from '../utils/pdfGenerator.js';
const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

// ─── Helpers ──────────────────────────────────────────────────────────────

// Balance is computed on the fly: granted (from the year's ledger ) minus the
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
  // application.userId may be a populated User document (has ._id and
  // .placeOfAssignment already loaded) or a plain ObjectId, depending on
  // the caller. String(populatedDoc) does NOT give back the hex id — it
  // stringifies to "[object Object]" — so that case must be unwrapped
  // explicitly, or every comparison below silently fails.
  const isPopulated = application.userId && typeof application.userId === 'object' && application.userId._id;
  const ownerId = String(isPopulated ? application.userId._id : application.userId);

  if (req.user.userId === ownerId) return true;
  if (req.user.role === 'ADMINISTRATOR') return true;
  if (req.user.role === 'FOCAL_PERSON') {
    const ownerPlace = isPopulated
      ? application.userId.placeOfAssignment
      : (await User.findById(ownerId).select('placeOfAssignment').lean())?.placeOfAssignment;
    const me = await User.findById(req.user.userId).select('placeOfAssignment').lean();
    return !!ownerPlace && !!me && ownerPlace === me.placeOfAssignment;
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
// Only contractuals with a currently in-force contract are listed — someone
// whose last contract lapsed no longer needs active monitoring here (their
// historical ledger is still reachable via GET /credits/:userId if needed).
router.get('/credits', verifyToken, requireRole('ADMINISTRATOR', 'FOCAL_PERSON'), async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();

    const activeContractUserIds = await Contract.find({ status: 'ACTIVE', isArchived: false }).distinct('userId');

    let userQuery = { role: 'CONTRACTUAL', _id: { $in: activeContractUserIds } };
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

// Cancel an application.
//   - PENDING / RECOMMENDED: the applicant themself, their scoped
//     FOCAL_PERSON, or an ADMINISTRATOR may cancel.
//   - APPROVED: ADMINISTRATOR only (this is the one case that actually
//     reverses a credit deduction — balance is computed on the fly from
//     APPROVED applications, so flipping status to CANCELLED restores the
//     balance automatically, no ledger edit needed).
//   - DISAPPROVED / CANCELLED: nothing to cancel.
router.patch('/applications/:id/cancel', verifyToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const application = await WellnessLeaveApplication.findById(req.params.id).populate('userId', 'placeOfAssignment');
    if (!application) return res.status(404).json({ message: 'Application not found' });

    const isOwner = String(application.userId?._id || application.userId) === req.user.userId;
    const isAdmin = req.user.role === 'ADMINISTRATOR';
    const isScopedFocal = req.user.role === 'FOCAL_PERSON' && await canManageUser(req, application.userId);

    if (application.status === 'APPROVED') {
      if (!isAdmin) {
        return res.status(403).json({ message: 'Only an administrator can cancel an approved Wellness Leave application.' });
      }
    } else if (['PENDING', 'RECOMMENDED'].includes(application.status)) {
      if (!isOwner && !isAdmin && !isScopedFocal) {
        return res.status(403).json({ message: 'Access denied' });
      }
    } else {
      return res.status(400).json({ message: `Cannot cancel an application with status ${application.status}.` });
    }

    application.status = 'CANCELLED';
    application.cancelledAt = new Date();
    application.cancelledBy = req.user.userId;
    if (reason) application.cancelReason = reason;
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
    // The paper form carries the supervisor's recommendation and the ARDMS
    // approval as one physical signing round — the scan is what logs both
    // into the system at once, so PENDING (not yet acted on digitally) is
    // just as scannable as RECOMMENDED (already acted on digitally, e.g.
    // via the manual PATCH .../recommend path for applications not printed).
    if (!['PENDING', 'RECOMMENDED'].includes(application.status)) {
      return res.status(400).json({ message: `Cannot log approval for an application with status ${application.status}.` });
    }

    const { balance } = await getBalance(application.userId, application.year);
    if (application.daysRequested > balance) {
      return res.status(400).json({ message: `Insufficient remaining balance for ${application.year} (${balance} day(s) left).` });
    }

    // If no digital recommendation was ever recorded (the normal case for a
    // printed-and-signed form), the paper signature stands in for it — log
    // it here so the record and printed history stay accurate.
    if (application.status === 'PENDING') {
      application.supervisor = {
        name: application.supervisor?.name || '',
        position: application.supervisor?.position || 'Immediate Supervisor',
        action: 'RECOMMENDED',
        remarks: application.supervisor?.remarks || 'Recommended via signed paper form (verified at QR approval scan).',
        actionBy: req.user.userId,
        actionDate: new Date()
      };
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

// ─── Printable form (landscape, one page) ────────────────────────────────
// Styled after standard CSC leave-form conventions: agency letterhead,
// boxed approval sections, single page. Landscape short-bond (11in x 8.5in)
// gives room for a two-column layout — applicant details on the left,
// the two-step approval workflow + QR on the right — without spilling to
// a second page.

const escapeLatex = (text) => {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%$#_{}]/g, '\\$&')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
};

const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

// The logo is bundled inside backend/assets so form generation works
// regardless of deployment topology (e.g. frontend on Netlify, backend on
// Render as separate services — the backend never has a `frontend/`
// directory on its filesystem in that setup, which is why this used to
// silently fall back to no logo). The old sibling-frontend path is kept as
// a fallback for anyone still running everything from one checkout via
// start.js with an out-of-date backend/assets copy.
const LOGO_SOURCE_PATH = path.join(process.cwd(), 'assets', 'denr-logo.png');
const LOGO_FALLBACK_PATH = path.join(process.cwd(), '..', 'frontend', 'public', 'denr-logo.png');
const HTML_TEMPLATE_PATH = path.join(process.cwd(), 'templates', 'wellness_leave.html');

router.get('/applications/:id/form', verifyToken, async (req, res) => {
  let pdfPath, qrPngPath, logoPngPath, tempDir, baseFile;
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
    pdfPath = path.join(tempDir, `${baseFile}.pdf`);
    qrPngPath = path.join(tempDir, `${baseFile}_qr.png`);
    logoPngPath = path.join(tempDir, `${baseFile}_logo.png`);

    const logoSource = fs.existsSync(LOGO_SOURCE_PATH)
      ? LOGO_SOURCE_PATH
      : (fs.existsSync(LOGO_FALLBACK_PATH) ? LOGO_FALLBACK_PATH : null);
    if (logoSource) {
      fs.copyFileSync(logoSource, logoPngPath);
    } else {
      logoPngPath = '';
    }

    const scanUrl = `${FRONTEND_URL}/wellness-scan/${application._id}/${application.qrToken}`;
    await QRCode.toFile(qrPngPath, scanUrl, { width: 300, margin: 1 });

    const emp = application.employeeSnapshot || {};
    const sup = application.supervisor || {};
    const app = application.approver || {};

    // Credits left "if approved": current on-the-fly balance minus this
    // application's days. If it's already APPROVED, getBalance() has already
    // subtracted it, so the current balance IS the post-approval figure.
    const { balance } = await getBalance(application.userId._id, application.year);
    const creditsLeftIfApproved = application.status === 'APPROVED'
      ? balance
      : Math.round((balance - application.daysRequested) * 100) / 100;

    // Generate PDF using Node.js (Puppeteer) instead of Python/WeasyPrint
    await generateWellnessLeavePdf({
      htmlTemplatePath: HTML_TEMPLATE_PATH,
      outputPdfPath: pdfPath,
      logoPath: logoPngPath,
      qrPath: qrPngPath,
      data: {
        applicationNumber: application.applicationNumber,
        employeeName: emp.fullName || '',
        employeePosition: emp.position || '',
        placeOfAssignment: emp.placeOfAssignment || '',
        inclusiveDates: `${formatDate(application.startDate)} to ${formatDate(application.endDate)}`,
        daysRequested: application.daysRequested,
        creditsLeftIfApproved,
        reason: application.reason || 'N/A',
        supervisorStatus: sup.action || 'Pending',
        supervisorRemarks: sup.remarks ? `— ${sup.remarks}` : '',
        approverStatus: app.action || 'Pending',
        approverRemarks: app.remarks ? `— ${app.remarks}` : '',
      },
    });

    if (!fs.existsSync(pdfPath)) throw new Error('PDF not created by Puppeteer.');

    res.setHeader('Content-Disposition', `inline; filename="${application.applicationNumber}.pdf"`);
    res.sendFile(pdfPath, (err) => {
      [pdfPath, qrPngPath, logoPngPath].forEach(f => {
        try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
      });
      if (err) console.error('Error sending Wellness Leave form PDF:', err);
    });
  } catch (error) {
    [pdfPath, qrPngPath, logoPngPath].forEach(f => {
      try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
    });
    console.error('Error generating Wellness Leave form PDF:', error);
    res.status(500).json({ message: 'Failed to generate Wellness Leave form.', error: errDetail(error) });
  }
});

export default router;