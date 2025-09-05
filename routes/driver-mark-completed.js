// routes/driver-mark-completed.js
const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../config/database'); // ✅ Correct import

console.log('driverMarkCompletedRouter loaded');

/**
 * @route POST /api/mark-completed
 * @desc Mark a job as completed and set driver back to available
 * @access Private
 */
router.post('/mark-completed', async (req, res) => {
  try {
    const { userId, emergencyId } = req.body;

    if (!userId || !emergencyId) {
      return res.status(400).json({ error: 'Missing userId or emergencyId' });
    }

    const pool = await poolPromise; // ✅ Use poolPromise
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    // Step 1: Update driver status to available
    const driverRequest = new sql.Request(transaction);
    driverRequest.input('userId', sql.Int, userId);
    const driverResult = await driverRequest.query(`
      UPDATE drivers
      SET status = 'available'
      WHERE user_id = @userId
    `);

    if (driverResult.rowsAffected[0] === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Driver not found for this user' });
    }

    // Step 2: Update report status to Completed
    const reportRequest = new sql.Request(transaction);
    reportRequest.input('emergencyId', sql.Int, emergencyId);
    const reportResult = await reportRequest.query(`
      UPDATE reports
      SET status = 'Completed'
      WHERE report_id = @emergencyId
    `);

    if (reportResult.rowsAffected[0] === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Report not found' });
    }

    await transaction.commit();

    return res.status(200).json({
      message: 'Job marked as completed',
      success: true
    });
  } catch (error) {
    console.error('Error marking job completed:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;
