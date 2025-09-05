// routes/driver-reject-job.js
const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../config/database'); // ✅ Use poolPromise

console.log('driverRejectJobRouter loaded');

/**
 * @route POST /api/driver/reject-job
 * @desc Mark a report (emergency job) as Cancelled
 * @access Private
 */
router.post('/reject-job', async (req, res) => {
  const { emergencyId } = req.body;

  if (!emergencyId) {
    return res.status(400).json({ error: 'Missing emergencyId' });
  }

  try {
    const pool = await poolPromise; // ✅ Get Azure SQL pool
    const request = pool.request();

    request.input('emergencyId', sql.Int, emergencyId);

    const result = await request.query(`
      UPDATE reports
      SET status = 'Cancelled'
      WHERE report_id = @emergencyId
    `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Report not found or already updated' });
    }

    res.status(200).json({ message: 'Job rejected successfully', success: true });
  } catch (error) {
    console.error('Error rejecting job:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;
