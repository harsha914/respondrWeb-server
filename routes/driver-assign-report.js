// routes/driver-assign-report.js
const express = require('express');
const sql = require('mssql');
const router = express.Router();

// Assign report to driver
router.post('/assign-report', async (req, res) => {
  try {
    const { reportId, userId, responseTime } = req.body;

    if (!reportId || !userId || !responseTime) {
      return res.status(400).json({ error: 'Missing reportId, userId, or responseTime' });
    }

    // Get DB connection pool
    const pool = await sql.connect();

    // Fetch driver_id from drivers table using user_id
    const driverResult = await pool.request()
      .input('userId', sql.BigInt, userId)
      .query('SELECT driver_id FROM drivers WHERE user_id = @userId');

    if (driverResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Driver not found for the given user ID' });
    }
    const driverId = driverResult.recordset[0].driver_id;

    // Insert into report_assignments
    const insertResult = await pool.request()
      .input('reportId', sql.BigInt, reportId)
      .input('driverId', sql.BigInt, driverId)
      .input('status', sql.VarChar, 'Accepted')
      .input('responseTime', sql.DateTime, new Date(responseTime))
      .query(`
        INSERT INTO report_assignments (report_id, driver_id, status, response_time)
        OUTPUT INSERTED.assignment_id
        VALUES (@reportId, @driverId, @status, @responseTime)
      `);

    const assignmentId = insertResult.recordset[0].assignment_id;

    res.status(200).json({ assignmentId });
  } catch (error) {
    console.error('Error assigning report:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;
