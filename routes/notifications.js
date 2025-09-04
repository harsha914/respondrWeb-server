const express = require('express');
const pool = require('../config/database');
const router = express.Router();

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
    const connection = await pool.getConnection();

    // Fetch SOS reports
    const [reports] = await connection.query(`
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

    // Fetch Booking reports
    const [bookings] = await connection.query(`
      SELECT 
        r.report_id AS id,
        'booking' AS type,
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
        r.destination
      FROM reports r
      JOIN users u ON r.user_id = u.user_id
      WHERE r.type = 'Booking'
      ORDER BY r.report_time DESC
    `);

    connection.release();

    // Format SOS emergency notifications
    const emergencyNotifications = reports.map(report => ({
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
      photoUrl: report.photo_url || '/placeholder.svg?height=200&width=300', // Use Blob URL if saved
    }));

    // Format Booking notifications
    const bookingNotifications = bookings.map(booking => {
      let bookingDetails = {};
      try {
        bookingDetails = JSON.parse(booking.description);
      } catch (err) {
        console.error(`Error parsing Booking description for report ${booking.id}:`, err.message);
      }

      return {
        id: booking.id.toString(),
        type: booking.type,
        status: booking.status,
        timestamp: booking.timestamp,
        sender: {
          name: booking.sender_name || 'Unknown',
          location: {
            lat: parseFloat(booking.latitude),
            lng: parseFloat(booking.longitude),
          },
          phone: booking.sender_phone || 'N/A',
        },
        description: bookingDetails,
        destination: booking.destination || 'Not specified',
      };
    });

    // Combine all notifications
    const allNotifications = [
      ...emergencyNotifications,
      ...bookingNotifications,
      ...mockSystemNotifications,
    ];

    res.status(200).json({ notifications: allNotifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
