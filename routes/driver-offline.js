// routes/driver-offline.js
const express = require('express');
const sql = require('mssql');
const router = express.Router();
const poolPromise = require('../config/database'); // Azure SQL pool

/**
 * @route POST /api/driver/go-offline
 * @desc Set driver status to Offline and clear coordinates
 * @access Private
 */
router.post('/go-offline', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  try {
    const pool = await poolPromise;
    const request = pool.request();

    request.input('userId', sql.Int, userId);

    const result = await request.query(`
      UPDATE drivers
      SET status = 'Offline', latitude = NULL, longitude = NULL
      WHERE user_id = @userId
    `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Driver not found for this user' });
    }

    res.status(200).json({ message: 'Driver status updated to Offline', success: true });
  } catch (error) {
    console.error('Error updating driver status to offline:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;
