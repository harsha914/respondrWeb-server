const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { sql, poolPromise } = require('../config/database'); // Import poolPromise for mssql

// LOGIN route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const pool = await poolPromise;

    const userResult = await pool.request()
      .input('email', sql.VarChar, email)
      .query('SELECT * FROM users WHERE email = @email');

    const user = userResult.recordset[0];
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Fetch driverId ONLY if role is Driver
    let driverId = null;
    if (user.role === 'Driver') {
      const driverResult = await pool.request()
        .input('userId', sql.Int, user.user_id)
        .query('SELECT driver_id FROM drivers WHERE user_id = @userId');

      if (driverResult.recordset.length > 0) {
        driverId = driverResult.recordset[0].driver_id;
      }
    }

    const token = jwt.sign(
      { user_id: user.user_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log('LOGIN RESPONSE PAYLOAD →', {
      userId: user.user_id,
      role: user.role,
      driverId,
    });

    res.json({
      token,
      userId: user.user_id,
      role: user.role,
      driverId,
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// SIGNUP route
router.post('/signup', async (req, res) => {
  const { name, email, password, phone_number } = req.body;
  console.log('Signup request:', { name, email, phone_number });

  try {
    if (!name || !email || !password || !phone_number) {
      return res.status(400).json({ message: 'Name, email, password, and phone number are required' });
    }

    // Role determination
    let role;
    if (email.endsWith('@gmail.com')) {
      role = 'Public';
    } else if (email.endsWith('@gov.in')) {
      role = 'Driver';
    } else if (email === 'admin@respondr.in') {
      role = 'Admin';
    } else {
      return res.status(400).json({
        message: 'Invalid email domain. Use @gmail.com, @gov.in, or admin@respondr.in'
      });
    }

    const pool = await poolPromise;
    const existingResult = await pool.request()
      .input('email', sql.VarChar, email)
      .query('SELECT * FROM users WHERE email = @email');
    if (existingResult.recordset.length > 0) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    if (email.endsWith('@respondr.in') && email !== 'admin@respondr.in') {
      return res.status(400).json({
        message: 'Only admin@respondr.in is allowed for @respondr.in domain'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Hashed password created');

    // Insert user
    const userResult = await pool.request()
      .input('name', sql.VarChar, name)
      .input('email', sql.VarChar, email)
      .input('password_hash', sql.VarChar, hashedPassword)
      .input('role', sql.VarChar, role)
      .input('phone_number', sql.VarChar, phone_number)
      .input('proof_uploaded', sql.Bit, false)
      .query(`
        INSERT INTO users (name, email, password_hash, role, phone_number, proof_uploaded)
        OUTPUT INSERTED.user_id
        VALUES (@name, @email, @password_hash, @role, @phone_number, @proof_uploaded)
      `);
    const userId = userResult.recordset[0].user_id;

    // If role is Driver, insert into drivers table
    if (role === 'Driver') {
      await pool.request()
        .input('user_id', sql.Int, userId)
        .input('status', sql.VarChar, 'Offline')
        .query('INSERT INTO drivers (user_id, status) VALUES (@user_id, @status)');
      console.log(`Driver record created for user ${userId}`);
    }

    // Generate JWT token
    const token = jwt.sign({ user_id: userId, role }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    res.json({ token, userId, role });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;