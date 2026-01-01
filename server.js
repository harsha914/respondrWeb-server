require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const reportRouter = require('./routes/report');
const verificationRouter = require('./routes/verification');
const driverVerificationRouter = require('./routes/driverVerification');
const driverRouter = require('./routes/driver');
const adminVerificationRouter = require('./routes/adminVerification');
const { sql, poolPromise } = require('./config/database');
const driverStatusRoutes = require('./routes/driver-status');
const driverOfflineRoutes = require('./routes/driver-offline');
const markBusyRoute = require('./routes/driver-mark-busy');
const notificationsRouter = require('./routes/notifications');
const emergencyAlertsRouter = require('./routes/emergency-alert');
const markCompletedRoute = require('./routes/driver-mark-completed');
const rejectJobRoute = require('./routes/driver-reject-job');
const assignReportRoute = require('./routes/driver-assign-report');
const dispatchRoute = require('./routes/driver-dispatch');
const bookingRoute = require('./routes/booking');

const app = express();

// CORS: Allow only our frontend
app.use(cors({
  origin: 'https://respondr.netlify.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Middleware
app.use(express.json());
app.use(fileUpload());

// Test DB connection on startup
const testDbConnection = async () => {
  try {
    const pool = await poolPromise;
    if (!pool) {
      console.error('Database pool is not initialized');
      return false;
    }
    const result = await pool.request().query('SELECT 1 as test');
    console.log('DB Test Query Result:', result.recordset);
    return true;
  } catch (err) {
    console.error('DB Connection Test Failed:', err);
    return false;
  }
};

// Initialize and start server
const startServer = async () => {
  // Wait for DB connection to be ready
  const dbReady = await testDbConnection();
  if (!dbReady) {
    console.error('Failed to start server due to DB connection issues');
    // process.exit(1);
  }

  // Request logging
  app.use((req, res, next) => {
    console.log(`Incoming request: ${req.method} ${req.url}`);
    next();
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/driver', driverRouter);
  app.use('/api/report', reportRouter);
  app.use('/api/user', userRoutes);
  app.use('/api/driver-verification', driverVerificationRouter);
  app.use('/api/admin-verification', adminVerificationRouter);
  app.use('/api', verificationRouter);
  app.use('/api/driver', driverStatusRoutes);
  app.use('/api/driver', driverOfflineRoutes);
  app.use('/api/driver', markBusyRoute);
  app.use('/api', notificationsRouter);
  app.use('/api', emergencyAlertsRouter);
  app.use('/api/driver', markCompletedRoute);
  app.use('/api/driver', rejectJobRoute);
  app.use('/api/driver', assignReportRoute);
  app.use('/api/driver', dispatchRoute);
  app.use('/api/booking', bookingRoute);

  // 404 handler
  app.use((req, res) => {
    console.log(`404: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Route not found' });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  });

  // Start server
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

// Start the server
startServer().catch(err => {
  console.error('Server startup failed:', err);
  process.exit(1);
});