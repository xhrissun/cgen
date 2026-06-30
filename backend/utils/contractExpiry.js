import cron from 'node-cron';
import Contract from '../models/Contract.js';

const PH_TIMEZONE = 'Asia/Manila';

/**
 * Returns "today" at midnight, in Philippine time, expressed as a Date.
 * Using a fixed UTC+8 offset (PH does not observe DST) so this is correct
 * regardless of what timezone the server process itself runs in.
 */
function getPhilippineMidnightToday() {
  const nowUtc = new Date();
  // Shift to PH wall-clock time, zero out the time portion, then shift back to UTC.
  const phNow = new Date(nowUtc.getTime() + 8 * 60 * 60 * 1000);
  const phMidnight = new Date(Date.UTC(phNow.getUTCFullYear(), phNow.getUTCMonth(), phNow.getUTCDate(), 0, 0, 0, 0));
  return new Date(phMidnight.getTime() - 8 * 60 * 60 * 1000);
}

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

export const startContractExpiryChecker = () => {
  // Catch-up run: if the server was down at midnight PH time (redeploy,
  // crash, etc.) and missed a scheduled run, this makes sure any contract
  // that should already be EXPIRED gets corrected as soon as the server
  // comes back up, instead of waiting for the next midnight.
  runExpiryCheck();

  // Run every day at midnight Philippine time (UTC+8), regardless of what
  // timezone the host server itself is running in (e.g. Render uses UTC).
  cron.schedule('0 0 * * *', runExpiryCheck, { timezone: PH_TIMEZONE });

  console.log('✓ Contract expiry checker scheduled (daily at 00:00 Asia/Manila, with startup catch-up)');
};