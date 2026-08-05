// backend/routes/wellnessLeave.js
//
// Wellness Leave under CSC Resolution No. 2501292 (13 Nov 2025) and CSC MC
// No. 01, s. 2026. Endpoints cover:
//   - credit balances (contractual self-view, focal/admin monitoring)
//   - filing an application (no deduction until APPROVED)
//   - supervisor/focal recommendation, ARDMS approval (manual or QR scan)
//   - the printable form: official Civil Service Form No. 6 "Application for
//     Leave" (A4), rendered via a pdf-lib overlay onto a blank master copy
//     of the real CSC form (see utils/csForm6WellnessLeave.js), carrying a
//     QR code for the scan-approve flow in place of the tenured-employee
//     system's barcode
import express from 'express';
import fs from 'fs';
import path from 'path';
import { errDetail } from '../utils/errors.js';
import { verifyToken, requireRole } from './auth.js';
import User from '../models/User.js';
import Contract from '../models/Contract.js';
import WellnessLeaveApplication from '../models/WellnessLeaveApplication.js';
import WellnessLeaveCredit from '../models/WellnessLeaveCredit.js';
import { grantWellnessLeaveCredits } from '../utils/wellnessLeaveCredits.js';
import { generateWellnessLeaveCsForm6Pdf } from '../utils/csForm6WellnessLeave.js';
import { logActivity } from '../utils/activityLogger.js';
const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

// ─── Helpers ──────────────────────────────────────────────────────────────

// Balance is computed on the fly: granted (from the year's ledger) minus the
// sum of APPROVED applications for that year. This is what makes "shall not
// be deducted unless approved" automatic — PENDING/RECOMMENDED/DISAPPROVED/
// CANCELLED applications never subtract from it.
//
// `pending` additionally sums PENDING/RECOMMENDED applications — days
// already committed but not yet approved/deducted — and `projectedBalance`
// is `balance` minus that, i.e. what's realistically left to request once
// everything currently in flight gets approved. `balance` alone still
// governs actual approval (PATCH /applications/:id/approve unchanged,
// correctly checking only what's already been approved), but filing a NEW
// application is checked against `projectedBalance` so an applicant can't
// stack several requests that individually look fine against `balance` but
// together exceed what they actually have — see POST /applications below.
async function getBalance(userId, year) {
  const ledger = await WellnessLeaveCredit.findOne({ userId, year }).lean();
  const granted = ledger?.granted || 0;

  const apps = await WellnessLeaveApplication.find({
    userId, year, status: { $in: ['APPROVED', 'PENDING', 'RECOMMENDED'] }
  }).select('daysRequested status').lean();

  const used = apps
    .filter(a => a.status === 'APPROVED')
    .reduce((sum, a) => sum + (a.daysRequested || 0), 0);
  const pending = apps
    .filter(a => a.status !== 'APPROVED')
    .reduce((sum, a) => sum + (a.daysRequested || 0), 0);

  const balance = Math.round((granted - used) * 100) / 100;
  const projectedBalance = Math.round((balance - pending) * 100) / 100;

  return { year, granted, used, pending, balance, projectedBalance };
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
// Only employees with a currently in-force contract are listed — someone
// whose last contract lapsed no longer needs active monitoring here (their
// historical ledger is still reachable via GET /credits/:userId if needed).
//
// Role filter covers both CONTRACTUAL and FOCAL_PERSON: both are
// Contract-of-Service personnel who accrue Wellness Leave credits the
// moment a qualifying contract is created (see utils/wellnessLeaveCredits.js,
// which isn't role-gated at all). This previously filtered to role:
// 'CONTRACTUAL' only, so focal persons with a perfectly valid active
// contract and a granted ledger simply never showed up here — it looked
// like their credits were never granted when they actually were, just not
// displayed.
router.get('/credits', verifyToken, requireRole('ADMINISTRATOR', 'FOCAL_PERSON'), async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();

    const activeContractUserIds = await Contract.find({ status: 'ACTIVE', isArchived: false }).distinct('userId');

    let userQuery = { role: { $in: ['CONTRACTUAL', 'FOCAL_PERSON'] }, _id: { $in: activeContractUserIds } };
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

// Manual override of a user's granted Wellness Leave credits for a given
// year — corrections, exceptions outside the automatic NEW/RENEWAL grant
// rules, migrating a pre-system balance, etc. `amount` is a signed delta
// applied on top of whatever `granted` already is (negative to deduct); a
// non-empty reason is mandatory. Every adjustment is appended to
// adjustmentHistory rather than overwriting anything, so the ledger keeps a
// permanent, attributable record of who changed the figure, when, by how
// much, and why — separate from (and never touching) grantHistory, which
// stays a pure record of the automatic contract-driven grants.
router.post('/credits/:userId/adjust', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const { year, amount, reason } = req.body;
    const y = parseInt(year, 10);
    const amt = parseFloat(amount);

    if (!y) return res.status(400).json({ message: 'Year is required.' });
    if (!Number.isFinite(amt) || amt === 0) {
      return res.status(400).json({ message: 'A non-zero adjustment amount is required.' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'A reason is required for manual credit adjustments.' });
    }

    const targetUser = await User.findById(req.params.userId).select('username personalInfo').lean();
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    let ledger = await WellnessLeaveCredit.findOne({ userId: req.params.userId, year: y });
    if (!ledger) {
      ledger = new WellnessLeaveCredit({ userId: req.params.userId, year: y, granted: 0 });
    }

    const before = ledger.granted;
    const after = Math.round((before + amt) * 1000) / 1000;
    if (after < 0) {
      return res.status(400).json({ message: `This adjustment would bring granted credits below zero (currently ${before}).` });
    }

    ledger.granted = after;
    ledger.adjustmentHistory.push({
      amount: amt,
      before,
      after,
      reason: reason.trim(),
      adjustedBy: req.user.userId,
      date: new Date()
    });
    await ledger.save();

    const targetName = [targetUser.personalInfo?.firstName, targetUser.personalInfo?.lastName].filter(Boolean).join(' ') || targetUser.username;
    await logActivity({
      actionType: 'UPDATE',
      entityType: 'WellnessLeaveCredit',
      entityId: ledger._id,
      entityName: `Wellness Leave credits — ${targetName} (${y})`,
      performedBy: req.user.userId,
      changesBefore: { granted: before },
      changesAfter: { granted: after, adjustment: amt, reason: reason.trim() },
      req
    });

    res.json(ledger);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// Full audit trail (automatic contract-driven grants + manual adjustments)
// for one user's one-year ledger — self, scoped focal, or admin. Kept
// separate from GET /credits/:userId (which only returns the on-the-fly
// balance summary) since the history arrays are only needed when someone
// actually wants to see the audit trail.
router.get('/credits/:userId/:year/history', verifyToken, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId).select('placeOfAssignment').lean();
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    if (req.user.userId !== req.params.userId && !(await canManageUser(req, targetUser))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const ledger = await WellnessLeaveCredit.findOne({ userId: req.params.userId, year: parseInt(req.params.year, 10) })
      .populate('grantHistory.contractId', 'contractNumber')
      .populate('adjustmentHistory.adjustedBy', 'username personalInfo.firstName personalInfo.lastName')
      .lean();
    if (!ledger) return res.status(404).json({ message: 'No ledger found for that year.' });

    res.json(ledger);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: errDetail(error) });
  }
});

// ─── Applications ─────────────────────────────────────────────────────────

// File a new application. Does NOT touch credits — only validates that
// enough balance exists for the requested year so an obviously-invalid
// application can't even be filed.
//
// FOCAL_PERSON is included alongside CONTRACTUAL because focal persons are
// themselves Contract-of-Service personnel (see contracts.js, which
// generates contracts for role: { $in: ['CONTRACTUAL', 'FOCAL_PERSON'] })
// — they're just additionally given office-scoped recommend/monitor
// permissions in this system. Excluding them here meant a focal person
// with their own active contract had no way to apply for their own
// Wellness Leave at all.
router.post('/applications', verifyToken, requireRole('CONTRACTUAL', 'FOCAL_PERSON'), async (req, res) => {
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
    const { balance, pending, projectedBalance } = await getBalance(req.user.userId, year);
    if (days > projectedBalance) {
      return res.status(400).json({
        message: pending > 0
          ? `Insufficient Wellness Leave balance for ${year}. Available: ${balance} day(s), but ${pending} day(s) from other application(s) are already pending approval — only ${Math.max(projectedBalance, 0)} day(s) remain available to request.`
          : `Insufficient Wellness Leave balance for ${year}. Available: ${balance} day(s).`
      });
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

// Backfills a Wellness Leave application that was actually filed and acted
// on entirely on paper before this module existed, so credit balances and
// history stay accurate for leave the system never saw. Always created
// already APPROVED — it already happened — and always flagged
// `manualEntry.isManual` so it's clearly distinguishable everywhere (the
// applications queue, the employee's own history, the printable form) from
// anything the online workflow produced. `note` (e.g. the paper form's
// reference number/date, or why it's being logged now) is mandatory and,
// together with who logged it and when, is permanent — this route never
// edits an existing application, only creates new ones.
router.post('/applications/manual', verifyToken, requireRole('ADMINISTRATOR'), async (req, res) => {
  try {
    const { userId, startDate, endDate, daysRequested, reason, note } = req.body;

    if (!userId || !startDate || !endDate || !daysRequested) {
      return res.status(400).json({ message: 'Employee, inclusive dates, and days requested are required.' });
    }
    const days = parseFloat(daysRequested);
    if (!(days > 0)) {
      return res.status(400).json({ message: 'Days requested must be greater than zero.' });
    }
    if (!note || !note.trim()) {
      return res.status(400).json({ message: 'A note explaining this manual entry (e.g. the paper form reference) is required.' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const year = calendarYear(startDate);
    const { balance } = await getBalance(userId, year);
    if (days > balance) {
      return res.status(400).json({
        message: `Insufficient Wellness Leave balance for ${year}. Available: ${balance} day(s). ` +
          `If this pre-system leave predates the ledger's granted credits, adjust the credits first (POST /credits/:userId/adjust).`
      });
    }

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
      },
      status: 'APPROVED',
      approver: {
        name: 'Manual entry',
        position: 'Assistant Regional Director for Management Services',
        action: 'APPROVED',
        remarks: 'Filed and approved on paper prior to this system; entered manually for record-keeping.',
        actionBy: req.user.userId,
        actionDate: new Date()
      },
      manualEntry: {
        isManual: true,
        loggedBy: req.user.userId,
        loggedAt: new Date(),
        note: note.trim()
      }
    });

    await application.save();

    await logActivity({
      actionType: 'CREATE',
      entityType: 'WellnessLeaveApplication',
      entityId: application._id,
      entityName: `${application.applicationNumber} - ${fullName} (manual entry, pre-system)`,
      performedBy: req.user.userId,
      changesAfter: {
        userId: application.userId,
        startDate: application.startDate,
        endDate: application.endDate,
        daysRequested: application.daysRequested,
        note: note.trim()
      },
      req
    });

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

// ─── Printable form (CS Form No. 6, A4 portrait, one page) ──────────────
// Overlaid onto the official Civil Service "Application for Leave" layout
// via csForm6WellnessLeave.js — see that file for the field-by-field
// mapping and why the VL/SL credit certification is rendered as N/A for
// Contract of Service personnel. Salary Grade is pulled live from the
// employee's current active contract (there is only ever one) rather than
// from the filing-time snapshot, since Contract — not User — is where
// salaryGrade actually lives (see models/User.js contractHistory, which
// only stores a contractId ref, and models/Contract.js salaryGrade).

const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

// Matches the reference form's "M/D/YYYY HH:MM AM/PM" timestamp style, in
// Manila time regardless of the server's host timezone (e.g. UTC in
// production) — same approach as the "Generated on" stamp in contracts.js.
const formatGeneratedOn = (d) => {
  const dt = new Date(d);
  const datePart = dt.toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric'
  });
  const timePart = dt.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  return `${datePart} ${timePart}`;
};

router.get('/applications/:id/form', verifyToken, async (req, res) => {
  let pdfPath, tempDir, baseFile;
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

    const emp = application.employeeSnapshot || {};

    // CS Form 6 wants "LAST, FIRST, MIDDLE" specifically — build that from
    // the live user record's structured name rather than the snapshot's
    // space-joined fullName, falling back to the snapshot if the user was
    // since deleted.
    const info = application.userId?.personalInfo;
    const nameLastFirstMiddle = info?.lastName
      ? [info.lastName, [info.firstName, info.middleName].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      : (emp.fullName || '');

    // Recommendation/approval happen by hand on the printed paper, not in
    // the system, so this form is always generated as a pre-filing (or
    // just-filed) snapshot: available credits = current balance, remaining
    // = balance minus the days being requested here. No status branching.
    const { balance } = await getBalance(application.userId._id, application.year);
    const availableCredits = balance;
    const remainingCredits = Math.round((balance - application.daysRequested) * 1000) / 1000;

    const scanUrl = `${FRONTEND_URL}/wellness-scan/${application._id}/${application.qrToken}`;

    // Salary Grade isn't on the User/snapshot at all — it lives on Contract.
    // Pull it from the employee's current active contract (guaranteed at
    // most one, same invariant the filing-time check in POST /applications
    // relies on).
    const activeContractForForm = application.userId
      ? await Contract.findOne({
          userId: application.userId._id,
          status: 'ACTIVE',
          isArchived: false
        }).select('salaryGrade isSpecialSalaryGrade').lean()
      : null;
    const salaryGrade = activeContractForForm
      ? `SG ${activeContractForForm.salaryGrade}${activeContractForForm.isSpecialSalaryGrade ? ' (Special)' : ''}`
      : undefined;

    await generateWellnessLeaveCsForm6Pdf({
      outputPdfPath: pdfPath,
      data: {
        officeDept: emp.placeOfAssignment || application.userId?.placeOfAssignment || '',
        name: nameLastFirstMiddle,
        dateOfFiling: formatDate(application.createdAt),
        position: emp.position || '',
        salaryGrade,
        daysRequested: application.daysRequested,
        inclusiveDates: `${formatDate(application.startDate)} - ${formatDate(application.endDate)}`,
        availableCredits,
        remainingCredits,
        applicationNumber: application.applicationNumber,
        generatedOn: formatGeneratedOn(new Date()),
        scanUrl,
      },
    });

    if (!fs.existsSync(pdfPath)) throw new Error('PDF not created.');

    res.setHeader('Content-Disposition', `inline; filename="${application.applicationNumber}.pdf"`);
    res.sendFile(pdfPath, (err) => {
      try { if (pdfPath && fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); } catch (_) {}
      if (err) console.error('Error sending Wellness Leave form PDF:', err);
    });
  } catch (error) {
    try { if (pdfPath && fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); } catch (_) {}
    console.error('Error generating Wellness Leave form PDF:', error);
    res.status(500).json({ message: 'Failed to generate Wellness Leave form.', error: errDetail(error) });
  }
});

export default router;