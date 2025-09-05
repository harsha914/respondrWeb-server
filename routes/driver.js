const express = require('express');
const { sql, poolPromise } = require('../config/database'); // Use poolPromise for mssql
const router = express.Router();
const authenticate = require('../middleware/auth');
const { assignToNearestDriver } = require('../services/geospatial');

/**
 * @route POST /assignment/:assignmentId
 * @desc Accept or cancel a driver assignment
 * @access Responder
 */
router.post('/assignment/:assignmentId', authenticate('Responder'), async (req, res) => {
  const { assignmentId } = req.params;
  const { action } = req.body;

  try {
    const pool = await poolPromise;

    // 1. Get the assignment and report details
    const assignmentResult = await pool.request()
      .input('assignmentId', sql.Int, assignmentId)
      .input('userId', sql.Int, req.user.userId)
      .query(`
        SELECT r.report_id, r.type, r.latitude, r.longitude, r.photo_url, r.description
        FROM report_assignments ra
        JOIN reports r ON ra.report_id = r.report_id
        WHERE ra.assignment_id = @assignmentId
        AND ra.driver_id = (SELECT driver_id FROM drivers WHERE user_id = @userId)
      `);

    if (assignmentResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const report = assignmentResult.recordset[0];

    // 2. Handle Accept Action
    if (action === 'accept') {
      await pool.transaction(async (transaction) => {
        const request = transaction.request();

        // Mark assignment as Accepted
        await request
          .input('assignmentId', sql.Int, assignmentId)
          .query(`
            UPDATE report_assignments
            SET status = 'Accepted', response_time = GETDATE()
            WHERE assignment_id = @assignmentId
          `);

        // Update report status
        await request
          .input('reportId', sql.Int, report.report_id)
          .query(`UPDATE reports SET status = 'Assigned' WHERE report_id = @reportId`);

        // Get ambulance ID
        const ambulanceResult = await request
          .input('userId', sql.Int, req.user.userId)
          .query(`
            SELECT ambulance_id FROM ambulances
            WHERE driver_id = (SELECT driver_id FROM drivers WHERE user_id = @userId)
          `);

        const ambulanceId = ambulanceResult.recordset[0]?.ambulance_id;
        if (!ambulanceId) throw new Error('No ambulance found for this driver');

        // Create dispatch record
        await request
          .input('ambulanceId', sql.Int, ambulanceId)
          .input('assignmentId', sql.Int, assignmentId)
          .input('reportId', sql.Int, report.report_id)
          .query(`
            INSERT INTO dispatch_records (ambulance_id, report_id, assignment_id, dispatch_status)
            VALUES (@ambulanceId, @reportId, @assignmentId, 'Dispatched')
          `);

        // Set driver status to Busy
        await request
          .input('userId', sql.Int, req.user.userId)
          .query(`UPDATE drivers SET status = 'Busy' WHERE user_id = @userId`);
      });

      return res.json({ message: 'Assignment accepted' });
    }

    // 3. Handle Cancel Action
    if (action === 'cancel') {
      await pool.request()
        .input('assignmentId', sql.Int, assignmentId)
        .query(`
          UPDATE report_assignments
          SET status = 'Cancelled', response_time = GETDATE()
          WHERE assignment_id = @assignmentId
        `);

      const countResult = await pool.request()
        .input('reportId', sql.Int, report.report_id)
        .query(`
          SELECT COUNT(*) AS count
          FROM report_assignments
          WHERE report_id = @reportId
        `);

      const count = countResult.recordset[0].count;

      if (count >= 3) {
        await pool.request()
          .input('reportId', sql.Int, report.report_id)
          .query(`UPDATE reports SET status = 'Cancelled' WHERE report_id = @reportId`);
        return res.json({ message: 'Assignment cancelled, report marked as unassignable' });
      }

      // Reassign
      await assignToNearestDriver(report.report_id, {
        latitude: report.latitude,
        longitude: report.longitude,
        type: report.type,
        photoUrl: report.photo_url,
        description: report.description,
      });

      return res.json({ message: 'Assignment cancelled, reassigned' });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('Error handling assignment:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * @route GET /pending
 * @desc Get all pending reports assigned to the logged-in driver
 * @access Responder
 */
router.get('/pending', authenticate('Responder'), async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input('userId', sql.Int, req.user.userId)
      .query(`
        SELECT r.report_id, r.type, r.latitude, r.longitude, r.photo_url, r.description
        FROM reports r
        JOIN report_assignments ra ON r.report_id = ra.report_id
        WHERE r.status = 'Pending'
        AND ra.driver_id = (SELECT driver_id FROM drivers WHERE user_id = @userId)
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching pending reports:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

module.exports = router;