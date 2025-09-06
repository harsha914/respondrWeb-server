const express = require('express');
const { sql, poolPromise } = require('../config/database');
const { generateSasUrl } = require('../utils/blob');
const router = express.Router();

router.get('/emergency-alerts', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT r.report_id AS id, r.status, r.report_time, u.name AS sender_name, 
             u.phone_number AS sender_phone, r.latitude, r.longitude, r.description, r.photo_url
      FROM reports r
      JOIN users u ON r.user_id = u.user_id
      WHERE r.type = 'SOS'
      ORDER BY r.report_time DESC
    `);

    const emergencyAlerts = result.recordset.map(report => ({
      id: report.id.toString(),
      type: 'emergency',
      status: report.status,
      timestamp: report.report_time,
      sender: {
        name: report.sender_name || 'Unknown',
        location: { lat: parseFloat(report.latitude), lng: parseFloat(report.longitude) },
        phone: report.sender_phone || 'N/A',
      },
      description: report.description || 'No description provided',
      photoUrl: report.photo_url ? generateSasUrl(report.photo_url) : '/placeholder.svg',
    }));

    res.status(200).json({ notifications: emergencyAlerts });
  } catch (error) {
    console.error('Error fetching emergency alerts:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

module.exports = router;
