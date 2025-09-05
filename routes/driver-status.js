const express = require('express');
const { sql, poolPromise } = require('../config/database'); // Explicit import for clarity
const router = express.Router();

/**
 * @route POST /api/driver/update-status
 * @desc Update driver's status to Available and update location
 * @access Private
 */
router.post('/update-status', async (req, res) => {
  const { userId, latitude, longitude } = req.body;

  // Validate required fields
  if (!userId || latitude == null || longitude == null) {
    return res.status(400).json({ error: 'Missing userId, latitude, or longitude' });
  }

  try {
    const pool = await poolPromise;
    const request = pool.request();

    // Input parameters with explicit types
    request.input('userId', sql.Int, userId);
    request.input('latitude', sql.Float, latitude);
    request.input('longitude', sql.Float, longitude);

    // Execute update query
    const result = await request.query(`
      UPDATE drivers
      SET status = 'Available', latitude = @latitude, longitude = @longitude
      WHERE user_id = @userId
    `);

    // Check if any rows were affected
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Driver not found for this user' });
    }

    res.status(200).json({
      message: 'Driver status updated to Available',
      success: true,
    });
  } catch (error) {
    console.error('Error updating driver status/location:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;