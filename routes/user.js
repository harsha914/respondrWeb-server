const express = require('express');
const { poolPromise, sql } = require('../config/database');
const authenticate = require('../middleware/auth');
const router = express.Router();

// GET /api/user/profile
router.get('/profile', authenticate(), async (req, res) => {
  try {
    const pool = await poolPromise;

    // Parameterized T-SQL Query
    const result = await pool.request()
      .input('userId', sql.Int, req.user.user_id) // ensure req.user.user_id is an integer
      .query(`
        SELECT 
          user_id, 
          name, 
          email, 
          role, 
          phone_number
        FROM users
        WHERE user_id = @userId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('❌ Error fetching user profile:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
