// routes/markBusy.js
const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../config/database'); // ✅ Correct import

console.log('markBusyRouter loaded');

/**
 * @route POST /api/mark-busy
 * @desc Mark driver as Busy and report as Assigned
 * @access Private
 */
router.post('/mark-busy', async (req, res) => {
  const { userId, reportId } = req.body;

  if (!userId || !reportId) {
    return res.status(400).json({ error: 'Missing userId or reportId' });
  }

  try {
    const pool = await poolPromise; // ✅ Use poolPromise
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    // Step 1: Update driver status
    const driverRequest = new sql.Request(transaction);
    driverRequest.input('userId', sql.Int, userId);
    const driverResult = await driverRequest.query(`
      UPDATE drivers
      SET status = 'Busy'
      WHERE user_id = @userId
    `);

    if (driverResult.rowsAffected[0] === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Driver not found for this user' });
    }

    // Step 2: Update report status
    const reportRequest = new sql.Request(transaction);
    reportRequest.input('reportId', sql.Int, reportId);
    const reportResult = await reportRequest.query(`
      UPDATE reports
      SET status = 'Assigned'
      WHERE report_id = @reportId AND status = 'Pending'
    `);

    if (reportResult.rowsAffected[0] === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Report not found or not in pending status' });
    }

    await transaction.commit();

    return res.status(200).json({
      message: 'Driver marked as Busy and report marked as Assigned',
      success: true
    });
  } catch (error) {
    console.error('Error marking driver busy or assigning report:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;
