const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const authenticate = require('../middleware/auth');
const sql = require('mssql'); // Using MSSQL

// Create a new ambulance booking
router.post(
  '/create',
  authenticate('Public'), // Ensure only authenticated Public users
  [
    check('type').equals('Booking'),
    check('latitude').isFloat({ min: -90, max: 90 }),
    check('longitude').isFloat({ min: -180, max: 180 }),
    check('destination').isString().notEmpty(),
    check('patientName').isString().notEmpty(),
    check('contactNumber').isString().notEmpty(),
    check('emergencyType').isIn(['accident', 'medical', 'other']),
    check('additionalInfo').optional().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      type,
      latitude,
      longitude,
      destination,
      patientName,
      contactNumber,
      emergencyType,
      additionalInfo,
    } = req.body;

    try {
      // Combine patient details into JSON
      const description = JSON.stringify({
        patientName,
        contactNumber,
        emergencyType,
        additionalInfo: additionalInfo || null,
      });

      const pool = await sql.connect();
      const request = pool.request();
      request.input('user_id', sql.Int, req.user.user_id);
      request.input('type', sql.VarChar(50), type);
      request.input('latitude', sql.Float, latitude);
      request.input('longitude', sql.Float, longitude);
      request.input('photo_url', sql.VarChar(sql.MAX), null);
      request.input('description', sql.VarChar(sql.MAX), description);
      request.input('destination', sql.VarChar(sql.MAX), destination);
      request.input('status', sql.VarChar(50), 'Pending');

      // Insert booking and return new report ID
      const result = await request.query(`
        INSERT INTO reports (user_id, type, latitude, longitude, photo_url, description, destination, status)
        OUTPUT INSERTED.report_id
        VALUES (@user_id, @type, @latitude, @longitude, @photo_url, @description, @destination, @status)
      `);

      const reportId = result.recordset[0].report_id;

      res.status(201).json({
        message: 'Booking created successfully',
        reportId,
      });
    } catch (error) {
      console.error('Create booking failed:', error);
      res.status(500).json({ error: 'Server error', details: error.message });
    }
  }
);

// Get booking status
router.get('/status/:reportId', authenticate('Public'), async (req, res) => {
  try {
    const { reportId } = req.params;

    const pool = await sql.connect();
    const request = pool.request();
    request.input('report_id', sql.Int, reportId);
    request.input('user_id', sql.Int, req.user.user_id);

    const result = await request.query(`
      SELECT status FROM reports WHERE report_id = @report_id AND user_id = @user_id
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.status(200).json({ status: result.recordset[0].status });
  } catch (error) {
    console.error('Error fetching booking status:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Cancel a booking
router.post('/cancel/:reportId', authenticate('Public'), async (req, res) => {
  try {
    const { reportId } = req.params;

    const pool = await sql.connect();
    const request = pool.request();
    request.input('report_id', sql.Int, reportId);
    request.input('user_id', sql.Int, req.user.user_id);

    // Check if booking exists
    const checkResult = await request.query(`
      SELECT status FROM reports WHERE report_id = @report_id AND user_id = @user_id
    `);

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const currentStatus = checkResult.recordset[0].status;

    if (currentStatus !== 'Pending') {
      return res.status(400).json({ error: 'Cannot cancel a booking that is not pending' });
    }

    // Cancel the booking
    const cancelRequest = pool.request();
    cancelRequest.input('status', sql.VarChar(50), 'Cancelled');
    cancelRequest.input('report_id', sql.Int, reportId);
    cancelRequest.input('user_id', sql.Int, req.user.user_id);

    await cancelRequest.query(`
      UPDATE reports SET status = @status WHERE report_id = @report_id AND user_id = @user_id
    `);

    res.status(200).json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;
