const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const authenticate = require('../middleware/auth');
const sql = require('mssql');
const { BlobServiceClient } = require('@azure/storage-blob');

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

    return blockBlobClient.url; // Return the public URL
  } catch (err) {
    console.error('Azure Blob upload error:', err);
    throw new Error('Failed to upload file to Azure Blob');
  }
};

// Create report route
router.post(
  '/create',
  authenticate('Public'),
  [
    check('type').isIn(['SOS', 'Booking']),
    check('latitude').isFloat({ min: -90, max: 90 }),
    check('longitude').isFloat({ min: -180, max: 180 }),
    check('description').optional().isString(),
    check('destination').optional().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { type, latitude, longitude, description, destination } = req.body;
    let photoUrl = null;

    try {
      // Validate and upload SOS photo
      if (type === 'SOS') {
        if (!req.files?.photo) {
          return res.status(400).json({ error: 'Photo required for SOS' });
        }

        const photo = req.files.photo;

        if (!['image/jpeg', 'image/png'].includes(photo.mimetype)) {
          return res.status(400).json({ error: 'Only JPEG/PNG allowed' });
        }

        if (photo.size > 5 * 1024 * 1024) {
          return res.status(400).json({ error: 'File too large (max 5MB)' });
        }

        photoUrl = await uploadToAzure(photo);
      } else if (!destination) {
        return res.status(400).json({ error: 'Destination required for Booking' });
      }

      // Insert into MSSQL
      const pool = await sql.connect();
      const request = pool.request();
      request.input('user_id', sql.Int, req.user.user_id);
      request.input('type', sql.VarChar(50), type);
      request.input('latitude', sql.Float, latitude);
      request.input('longitude', sql.Float, longitude);
      request.input('photo_url', sql.VarChar(sql.MAX), photoUrl);
      request.input('description', sql.VarChar(sql.MAX), description || null);
      request.input('destination', sql.VarChar(sql.MAX), destination || null);
      request.input('status', sql.VarChar(50), 'Pending');

      const result = await request.query(`
        INSERT INTO reports (user_id, type, latitude, longitude, photo_url, description, destination, status)
        OUTPUT INSERTED.report_id
        VALUES (@user_id, @type, @latitude, @longitude, @photo_url, @description, @destination, @status)
      `);

      const reportId = result.recordset[0].report_id;

      return res.status(201).json({
        message: 'Report created successfully',
        reportId,
        photoUrl,
      });
    } catch (error) {
      console.error('Create report failed:', error);
      return res.status(500).json({ error: 'Server error', details: error.message });
    }
  }
);

module.exports = router;
