const express = require('express');
const { sql, poolPromise } = require('../config/database'); // Use poolPromise from config
const router = express.Router();

/**
 * @route GET /api/driver/driver-id/:userId
 * @desc Get driver_id for a given user_id
 * @access Private (Authenticated users)
 */
router.get('/driver-id/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log(`Fetching driver_id for userId: ${userId}`);

  try {
    const pool = await poolPromise;
    const request = pool.request();
    request.input('userId', sql.Int, userId);

    const result = await request.query(`
      SELECT driver_id FROM drivers WHERE user_id = @userId
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Driver not found for this user' });
    }

    return res.status(200).json({ driverId: result.recordset[0].driver_id });
  } catch (error) {
    console.error('Error fetching driver_id:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * @route GET /api/driver/verification-status/:userId
 * @desc Get verification status of a driver
 * @access Private (Authenticated users)
 */
router.get('/verification-status/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log(`Fetching verification status for userId: ${userId}`);

  try {
    const pool = await poolPromise;

    // 🔹 Step 1: Get driver_id
    const driverRequest = pool.request();
    driverRequest.input('userId', sql.Int, userId);
    const driverResult = await driverRequest.query(`
      SELECT driver_id FROM drivers WHERE user_id = @userId
    `);

    if (driverResult.recordset.length === 0) {
      console.log(`No driver found for userId: ${userId}`);
      return res.status(200).json({ status: 'not_submitted' });
    }

    const driverId = driverResult.recordset[0].driver_id;
    console.log(`Found driver_id: ${driverId} for userId: ${userId}`);

    // 🔹 Step 2: Get verification status
    const verificationRequest = pool.request();
    verificationRequest.input('driverId', sql.Int, driverId);
    const verificationResult = await verificationRequest.query(`
      SELECT status FROM verifications WHERE driver_id = @driverId
    `);

    if (verificationResult.recordset.length === 0) {
      console.log(`No verification record for driverId: ${driverId}`);
      return res.status(200).json({ status: 'not_submitted' });
    }

    // 🔹 Step 3: Map DB status to frontend-friendly status
    const dbStatus = verificationResult.recordset[0].status;
    const statusMap = {
      Pending: 'pending',
      Approved: 'accepted',
      Rejected: 'rejected'
    };
    const status = statusMap[dbStatus] || dbStatus.toLowerCase();

    return res.status(200).json({ status });
  } catch (error) {
    console.error('Error fetching verification status:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;