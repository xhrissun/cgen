import cron from 'node-cron';
import Contract from '../models/Contract.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';

const PH_TIMEZONE = 'Asia/Manila';
const STALE_DAYS = 15;
const STALE_STATUSES = ['DRAFT', 'PENDING', 'APPROVED'];

/**
 * Returns "today" at midnight, in Philippine time, expressed as a Date.
 * Using a fixed UTC+8 offset (PH does not observe DST) so this is correct
 * regardless of what timezone the server process itself runs in.
 */
function getPhilippineMidnightToday() {
  const nowUtc = new Date();
  const phNow = new Date(nowUtc.getTime() + 8 * 60 * 60 * 1000);
  const phMidnight = new Date(Date.UTC(phNow.getUTCFullYear(), phNow.getUTCMonth(), phNow.getUTCDate(), 0, 0, 0, 0));
  return new Date(phMidnight.getTime() - 8 * 60 * 60 * 1000);
}

/**
 * ACTIVE → EXPIRED
 * Any active contract whose endDate has passed (PH time) is no longer
 * in force. This only ever touches `status` (+ updatedAt) — nothing else
 * about the contract document is changed.
 */
async function runExpiryCheck() {
  try {
    const todayPH = getPhilippineMidnightToday();

    const expiredContracts = await Contract.updateMany(
      {
        status: 'ACTIVE',
        endDate: { $lt: todayPH },
        isArchived: false
      },
      {
        status: 'EXPIRED',
        updatedAt: new Date()
      }
    );

    if (expiredContracts.modifiedCount > 0) {
      console.log(`✓ Auto-expired ${expiredContracts.modifiedCount} contract(s)`);
    }
  } catch (error) {
    console.error('❌ Error in contract expiry checker:', error);
  }
}

/**
 * Notify the contract's owner + all administrators that a contract was
 * auto-cancelled by the system, and why. Best-effort: a notification
 * failure should never stop the status job itself.
 */
async function notifyContractCancelled(contract, reason) {
  try {
    const docs = [];
    const period = `${contract.year} S${contract.semester}`;
    const message = `Contract ${contract.contractNumber} (${contract.position}, ${period}) was automatically cancelled by the system. Reason: ${reason}`;

    if (contract.userId) {
      docs.push({
        userId: contract.userId,
        type: 'CONTRACT_CANCELLED',
        title: 'Contract auto-cancelled',
        message,
        relatedId: contract._id,
        relatedModel: 'Contract'
      });
    }

    const admins = await User.find({ role: 'ADMINISTRATOR' }).select('_id').lean();
    for (const admin of admins) {
      // Avoid double-notifying if the contract owner is themselves an admin.
      if (String(admin._id) === String(contract.userId)) continue;
      docs.push({
        userId: admin._id,
        type: 'CONTRACT_CANCELLED',
        title: 'Contract auto-cancelled',
        message,
        relatedId: contract._id,
        relatedModel: 'Contract'
      });
    }

    if (docs.length > 0) {
      await Notification.insertMany(docs);
    }
  } catch (error) {
    console.error(`❌ Failed to send cancellation notification for ${contract.contractNumber}:`, error);
  }
}

/**
 * Stale contract auto-resolution (DRAFT / PENDING / APPROVED → ACTIVE or CANCELLED)
 *
 * Some personnel create or progress a contract partway and never come back
 * to finish pushing it to ACTIVE (or upload the signed copy), leaving
 * stray records sitting forever. To stop these from piling up, any
 * DRAFT/PENDING/APPROVED contract that hasn't been touched in
 * STALE_DAYS days is auto-resolved:
 *
 *  - Stale contracts are grouped by "duplicate key" — same employee,
 *    same position, same contract period (userId + position + year +
 *    semester). This is the same key used by the duplicate-prevention
 *    check on contract creation and by the CSV export's duplicate
 *    grouping.
 *  - If a non-stale ACTIVE or EXPIRED contract already exists for that
 *    same key (i.e. the period is already legitimately covered),
 *    EVERY contract in the stale group is CANCELLED — there's nothing
 *    left for them to become active about.
 *  - Otherwise, if the group has exactly ONE stale contract (no
 *    duplicates) → it is promoted straight to ACTIVE.
 *  - Otherwise (multiple stale duplicates, no existing active/expired
 *    contract) → the most recently created one is kept and promoted to
 *    ACTIVE; every older duplicate in that group is CANCELLED.
 *  - Every contract that gets CANCELLED here triggers a notification to
 *    its owner and all administrators explaining why.
 *
 * This function ONLY ever writes to `status` (+ updatedAt). It never
 * touches dates, salary figures, signatories, files, or any other field.
 */
async function runStaleContractAutoResolution() {
  try {
    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

    const staleContracts = await Contract.find({
      status: { $in: STALE_STATUSES },
      isArchived: false,
      createdAt: { $lte: cutoff }
    })
      .select('_id userId position year semester createdAt contractNumber status')
      .lean();

    if (staleContracts.length === 0) return;

    const groups = new Map();
    for (const c of staleContracts) {
      const key = `${c.userId}-${c.position}-${c.year}-${c.semester}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }

    let activatedCount = 0;
    let cancelledCount = 0;

    for (const group of groups.values()) {
      const { userId, position, year, semester } = group[0];

      // Does a legitimately active/expired contract already cover this
      // exact employee + position + period, outside of this stale group?
      const existingCovering = await Contract.findOne({
        userId,
        position,
        year,
        semester,
        status: { $in: ['ACTIVE', 'EXPIRED'] },
        isArchived: false
      }).select('_id contractNumber').lean();

      if (existingCovering) {
        // Nothing for the stale group to become "active" about — cancel
        // all of them and notify.
        const ids = group.map((c) => c._id);
        await Contract.updateMany(
          { _id: { $in: ids } },
          { status: 'CANCELLED', updatedAt: new Date() }
        );
        cancelledCount += ids.length;

        for (const c of group) {
          await notifyContractCancelled(
            c,
            `Contract ${existingCovering.contractNumber} already covers this employee, position, and period.`
          );
        }
        continue;
      }

      if (group.length === 1) {
        // No duplicates and nothing else covers this period — activate it.
        await Contract.updateOne(
          { _id: group[0]._id },
          { status: 'ACTIVE', updatedAt: new Date() }
        );
        activatedCount += 1;
        continue;
      }

      // Duplicates exist among the stale group itself — keep the most
      // recently created copy, activate it, cancel the rest and notify.
      const sorted = [...group].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const [latest, ...older] = sorted;

      await Contract.updateOne(
        { _id: latest._id },
        { status: 'ACTIVE', updatedAt: new Date() }
      );
      activatedCount += 1;

      const olderIds = older.map((c) => c._id);
      await Contract.updateMany(
        { _id: { $in: olderIds } },
        { status: 'CANCELLED', updatedAt: new Date() }
      );
      cancelledCount += olderIds.length;

      for (const c of older) {
        await notifyContractCancelled(
          c,
          `Superseded by a more recently created contract (${latest.contractNumber}) for the same employee, position, and period.`
        );
      }
    }

    if (activatedCount > 0 || cancelledCount > 0) {
      console.log(
        `✓ Stale contract auto-resolution: activated ${activatedCount}, cancelled ${cancelledCount} contract(s) (${STALE_DAYS}+ days untouched in DRAFT/PENDING/APPROVED)`
      );
    }
  } catch (error) {
    console.error('❌ Error in stale contract auto-resolution:', error);
  }
}

async function runStatusAutomation() {
  // Order matters: resolve stale contracts first, then expire — in the
  // rare case a stale contract gets auto-activated with an endDate
  // already in the past, the expiry pass right after will immediately
  // correct it to EXPIRED rather than leaving it incorrectly ACTIVE
  // until tomorrow.
  await runStaleContractAutoResolution();
  await runExpiryCheck();
}

export const startContractExpiryChecker = () => {
  // Catch-up run: if the server was down at midnight PH time (redeploy,
  // crash, etc.) and missed a scheduled run, this makes sure any contract
  // that should already be EXPIRED/auto-resolved gets corrected as soon as
  // the server comes back up, instead of waiting for the next midnight.
  runStatusAutomation();

  // Run every day at midnight Philippine time (UTC+8), regardless of what
  // timezone the host server itself is running in (e.g. Render uses UTC).
  cron.schedule('0 0 * * *', runStatusAutomation, { timezone: PH_TIMEZONE });

  console.log('✓ Contract status automation scheduled (daily at 00:00 Asia/Manila, with startup catch-up): expiry + stale-contract resolution');
};