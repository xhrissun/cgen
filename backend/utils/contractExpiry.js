import cron from 'node-cron';
import Contract from '../models/Contract.js';

export const startContractExpiryChecker = () => {
  // Run every day at midnight
  cron.schedule('0 0 * * *', async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const expiredContracts = await Contract.updateMany(
        {
          status: 'ACTIVE',
          endDate: { $lt: today },
          isArchived: false
        },
        {
          status: 'EXPIRED',
          updatedAt: new Date()
        }
      );

      if (expiredContracts.modifiedCount > 0) {
        console.log(`✓ Auto-expired ${expiredContracts.modifiedCount} contracts`);
      }
    } catch (error) {
      console.error('❌ Error in contract expiry checker:', error);
    }
  });

  console.log('✓ Contract expiry checker scheduled');
};