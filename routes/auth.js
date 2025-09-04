const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../config/database'); // Use a centralized pool connection

// LOGIN route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('Login request:', { email });

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    console.log('User from DB:', user);

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (!user.password_hash) {
      console.error('No password stored for user:', email);
      return res.status(500).json({ message: 'User account error' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { user_id: user.user_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ token, userId: user.user_id, role: user.role });
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

    // Check if email already exists
    const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
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
    const [userResult] = await db.query(
      `INSERT INTO users (name, email, password_hash, role, phone_number, proof_uploaded) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, email, hashedPassword, role, phone_number, false]
    );
    const userId = userResult.insertId;

    // If role is Driver, insert into drivers table
    if (role === 'Driver') {
      await db.query(
        `INSERT INTO drivers (user_id, status) VALUES (?, ?)`,
        [userId, 'Offline']
      );
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
