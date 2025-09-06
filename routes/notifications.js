const express = require('express');
const { sql, poolPromise } = require('../config/database');
const { generateSasUrl } = require('../utils/blob');
const router = express.Router();

console.log('notificationsRouter loaded');

// Mock system notifications
const mockSystemNotifications = [
  {
    id: "system-3",
    type: "system",
    status: "unread",
    timestamp: new Date(Date.now() - 2 * 60 * 60000).toISOString(),
    title: "Verification Update",
    description: "Your driver verification is pending. Please complete all required steps.",
  },
  {
    id: "system-5",
    type: "system",
    status: "read",
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60000).toISOString(),
    title: "Welcome to Respondr",
    description: "Thank you for joining Respondr as a driver. Complete your verification to start accepting emergency requests.",
  },
];

router.get('/notifications', async (req, res) => {
  try {
    const pool = await poolPromise;

    // Fetch SOS reports
    const emergencyResult = await pool.request().query(`
      SELECT r.report_id AS id, r.status, r.report_time, u.name AS sender_name, 
             u.phone_number AS sender_phone, r.latitude, r.longitude, r.description, r.photo_url
      FROM reports r
      JOIN users u ON r.user_id = u.user_id
      WHERE r.type = 'SOS'
      ORDER BY r.report_time DESC
    `);

    const emergencyNotifications = emergencyResult.recordset.map(report => ({
      id: `sos-${report.id}`,
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

    // Fetch Booking reports
    const bookingResult = await pool.request().query(`
      SELECT r.report_id AS id, r.status, r.report_time, u.name AS sender_name, 
             u.phone_number AS sender_phone, r.latitude, r.longitude, r.description, r.destination
      FROM reports r
      JOIN users u ON r.user_id = u.user_id
      WHERE r.type = 'Booking'
      ORDER BY r.report_time DESC
    `);

    const bookingNotifications = bookingResult.recordset.map(booking => ({
      id: `booking-${booking.id}`,
      type: 'booking',
      status: booking.status,
      timestamp: booking.report_time,
      sender: {
        name: booking.sender_name || 'Unknown',
        location: { lat: parseFloat(booking.latitude), lng: parseFloat(booking.longitude) },
        phone: booking.sender_phone || 'N/A',
      },
      description: booking.description || 'No details',
      destination: booking.destination || 'Not specified',
    }));

    res.status(200).json({
      notifications: [
        ...emergencyNotifications,
        ...bookingNotifications,
        ...mockSystemNotifications,
      ],
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

module.exports = router;
