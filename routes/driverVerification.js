// routes/driverVerification.js
const express = require('express');
const pool = require('../config/database');
const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config();

const router = express.Router();
console.log('driverVerificationRouter loaded');

// Azure Blob setup
const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);
const containerName = process.env.AZURE_BLOB_CONTAINER || 'uploads';

// Helper: Upload file to Azure Blob
const uploadToAzure = async (file) => {
  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists({ access: 'container' }); // Public read access

    const blobName = `${Date.now()}-${file.name}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(file.data, {
      blobHTTPHeaders: { blobContentType: file.mimetype },
    });

    return blockBlobClient.url; // Return public URL
  } catch (err) {
    console.error('Azure Blob upload error:', err);
    throw new Error('Failed to upload file to Azure Blob');
  }
};

// Middleware for request logging
router.use((req, res, next) => {
  console.log(`DriverVerification Route: ${req.method} ${req.path}`);
  next();
});

// Submit verification
router.post('/submit', async (req, res) => {
  console.log('Received POST /api/driver-verification/submit');
  try {
    const { licenseNumber, ambulanceRegistration, address, driverId, userId } = req.body;

    // Validate inputs
    if (!licenseNumber || !ambulanceRegistration || !address || (!driverId && !userId)) {
      return res.status(400).json({ error: 'Missing required fields: licenseNumber, ambulanceRegistration, address, and either driverId or userId are required' });
    }

    // Validate files
    if (!req.files || !req.files.idProof || !req.files.license) {
      return res.status(400).json({ error: 'Missing required files: idProof and license are required' });
    }

    const idProof = req.files.idProof;
    const license = req.files.license;

    // Validate file types
    if (!idProof.mimetype.includes('jpeg') || !license.mimetype.includes('jpeg')) {
      return res.status(400).json({ error: 'Only JPG files are allowed' });
    }

    // Validate file size (5MB)
    if (idProof.size > 5 * 1024 * 1024 || license.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Files must be smaller than 5MB' });
    }

    // Resolve driver_id if only user_id is provided
    let resolvedDriverId = driverId;
    if (!resolvedDriverId && userId) {
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query(
          'SELECT driver_id FROM drivers WHERE user_id = ?',
          [userId]
        );
        if (rows.length === 0) {
          return res.status(400).json({ error: 'No driver profile found for the provided userId' });
        }
        resolvedDriverId = rows[0].driver_id;
      } finally {
        connection.release();
      }
    }

    if (!resolvedDriverId) {
      return res.status(400).json({ error: 'Invalid driverId or userId' });
    }

    // Upload files to Azure Blob
    const idProofUrl = await uploadToAzure(idProof);
    const licenseUrl = await uploadToAzure(license);

    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Update users table
      await connection.query(
        'UPDATE users SET address = ?, proof_uploaded = 1 WHERE user_id = ? AND role = ?',
        [address, userId, 'Driver']
      );

      // Insert or update verifications table
      const [existingVerifications] = await connection.query(
        'SELECT verification_id FROM verifications WHERE driver_id = ?',
        [resolvedDriverId]
      );

      if (existingVerifications.length > 0) {
        await connection.query(
          'UPDATE verifications SET id_proof = ?, drivers_license = ?, status = ?, created_at = NOW() WHERE driver_id = ?',
          [idProofUrl, licenseUrl, 'Pending', resolvedDriverId]
        );
      } else {
        await connection.query(
          'INSERT INTO verifications (driver_id, id_proof, drivers_license, status, created_at) VALUES (?, ?, ?, ?, NOW())',
          [resolvedDriverId, idProofUrl, licenseUrl, 'Pending']
        );
      }

      // Insert or update ambulances table
      await connection.query(
        'INSERT INTO ambulances (vehicle_number, driver_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE vehicle_number = ?',
        [ambulanceRegistration, resolvedDriverId, ambulanceRegistration]
      );

      // Update drivers table
      await connection.query(
        'UPDATE drivers SET license_number = ? WHERE driver_id = ?',
        [licenseNumber, resolvedDriverId]
      );

      await connection.commit();
      console.log(`Verification submitted successfully for driverId: ${resolvedDriverId}`);
      res.status(200).json({ message: 'Verification submitted successfully', status: 'Pending' });
    } catch (error) {
      await connection.rollback();
      console.error('Transaction error:', error);
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error submitting verification:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

module.exports = router;
