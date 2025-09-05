// routes/driver-dispatch.js
const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../config/database'); // ✅ Correct import

console.log('driverDispatchRouter loaded');

/**
 * @route POST /api/dispatch
 * @desc Handle ambulance dispatch and completion
 * @access Private
 */
router.post('/dispatch', async (req, res) => {
  try {
    const { userId, reportId, assignmentId, dispatchTime, action, arrivalTime, completionTime } = req.body;

    const pool = await poolPromise; // ✅ Use poolPromise for Azure SQL

    if (action === 'dispatch') {
      if (!userId || !reportId || !assignmentId || !dispatchTime) {
        return res.status(400).json({ error: 'Missing userId, reportId, assignmentId, or dispatchTime' });
      }

      // Fetch driver_id
      const driverResult = await pool.request()
        .input('userId', sql.Int, userId)
        .query('SELECT driver_id FROM drivers WHERE user_id = @userId');

      if (driverResult.recordset.length === 0) {
        return res.status(404).json({ error: 'Driver not found for the given user ID' });
      }
      const driverId = driverResult.recordset[0].driver_id;

      // Fetch ambulance_id
      const ambulanceResult = await pool.request()
        .input('driverId', sql.Int, driverId)
        .query('SELECT ambulance_id FROM ambulances WHERE driver_id = @driverId');

      if (ambulanceResult.recordset.length === 0) {
        return res.status(404).json({ error: 'Ambulance not found for the given driver ID' });
      }
      const ambulanceId = ambulanceResult.recordset[0].ambulance_id;

      // Insert into dispatch_records
      const insertResult = await pool.request()
        .input('ambulanceId', sql.Int, ambulanceId)
        .input('reportId', sql.Int, reportId)
        .input('assignmentId', sql.Int, assignmentId)
        .input('dispatchTime', sql.DateTime, new Date(dispatchTime))
        .input('status', sql.VarChar(50), 'Dispatched')
        .query(`
          INSERT INTO dispatch_records (ambulance_id, report_id, assignment_id, dispatch_time, dispatch_status)
          OUTPUT INSERTED.dispatch_id
          VALUES (@ambulanceId, @reportId, @assignmentId, @dispatchTime, @status)
        `);

      return res.status(200).json({ dispatchId: insertResult.recordset[0].dispatch_id });

    } else if (action === 'complete') {
      if (!reportId || !arrivalTime || !completionTime) {
        return res.status(400).json({ error: 'Missing reportId, arrivalTime, or completionTime' });
      }

      // Update dispatch_records
      await pool.request()
        .input('reportId', sql.Int, reportId)
        .input('arrivalTime', sql.DateTime, new Date(arrivalTime))
        .input('completionTime', sql.DateTime, new Date(completionTime))
        .input('status', sql.VarChar(50), 'Completed')
        .query(`
          UPDATE dispatch_records
          SET arrival_time = @arrivalTime,
              completion_time = @completionTime,
              dispatch_status = @status
          WHERE report_id = @reportId
        `);

      return res.status(200).json({ message: 'Dispatch record updated' });

    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Error handling dispatch:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;
