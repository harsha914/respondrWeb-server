// src/middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * Middleware to authenticate requests using JWT tokens
 * @param {string|null} requiredRole - Role to restrict access ('Admin', 'Driver', 'Public') or null for any
 */
const authenticate = (requiredRole = null) => (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token missing or invalid' });
    }

    const token = authHeader.split(' ')[1];

    // Verify JWT
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        console.error('JWT verification failed:', err.message);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      // Role-based check
      if (requiredRole && decoded.role !== requiredRole) {
        return res.status(403).json({ error: 'Access denied: insufficient permissions' });
      }

      req.user = decoded; // { user_id, role }
      next();
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

module.exports = authenticate;
