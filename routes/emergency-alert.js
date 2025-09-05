const express = require('express');
const { sql, poolPromise } = require('../config/database'); // Import poolPromise for mssql
const router = express.Router();

router.get('/emergency-alerts', async (req, res) => {
  try {
    const pool = await poolPromise;
    
    // Fetch emergency alerts from reports table using T-SQL
    const result = await pool.request()
      .query(`
        SELECT 
          r.report_id AS id,
          'emergency' AS type,
          CASE 
            WHEN r.status = 'Pending' THEN 'new'
            WHEN r.status IN ('Assigned', 'In_Progress') THEN 'accepted'
            WHEN r.status = 'Cancelled' THEN 'rejected'
            ELSE r.status
          END AS status,
          r.report_time AS timestamp,
          u.name AS sender_name,
          u.phone_number AS sender_phone,
          r.latitude,
          r.longitude,
          r.description,
          r.photo_url
        FROM reports r
        JOIN users u ON r.user_id = u.user_id
        WHERE r.type = 'SOS'
        ORDER BY r.report_time DESC
      `);

    const reports = result.recordset;

    // Map DB results
    const emergencyAlerts = reports.map(report => ({
      id: report.id.toString(),
      type: report.type,
      status: report.status,
      timestamp: report.timestamp,
      sender: {
        name: report.sender_name || 'Unknown',
        location: {
          lat: parseFloat(report.latitude),
          lng: parseFloat(report.longitude),
        },
        phone: report.sender_phone || 'N/A',
      },
      description: report.description || 'No description provided',
      photoUrl: report.photo_url || '/placeholder.svg?height=200&width=300', // Use stored Azure URL
    }));

    res.status(200).json({ notifications: emergencyAlerts });
  } catch (error) {
    console.error('Error fetching emergency alerts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;