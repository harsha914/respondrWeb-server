// routes/driver-status.js
const express = require('express');
const sql = require('mssql');
const router = express.Router();
const poolPromise = require('../config/database'); // Azure SQL connection

/**
 * @route POST /api/driver/update-status
 * @desc Update driver's status to Available and update location
 * @access Private
 */
router.post('/update-status', async (req, res) => {
  const { userId, latitude, longitude } = req.body;

  if (!userId || latitude == null || longitude == null) {
    return res.status(400).json({ error: 'Missing userId, latitude, or longitude' });
  }

  try {
    const pool = await poolPromise;
    const request = pool.request();

    request.input('userId', sql.Int, userId);
    request.input('latitude', sql.Float, latitude);
    request.input('longitude', sql.Float, longitude);

    const result = await request.query(`
      UPDATE drivers
      SET status = 'Available', latitude = @latitude, longitude = @longitude
      WHERE user_id = @userId
    `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Driver not found for this user' });
    }

    res.status(200).json({
      message: 'Driver status updated to Available',
      success: true
    });
  } catch (error) {
    console.error('Error updating driver status/location:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;
