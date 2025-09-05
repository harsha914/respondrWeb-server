const express = require('express');
const { check, validationResult } = require('express-validator');
const authenticate = require('../middleware/auth');
const { sql, poolPromise } = require('../config/database');
const { BlobServiceClient, generateBlobSASQueryParameters, ContainerSASPermissions, SASProtocol } = require('@azure/storage-blob');
const crypto = require('crypto');
const dotenv = require('dotenv');
dotenv.config();

const router = express.Router();
console.log('reportRouter loaded');

// Azure Blob setup
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerName = process.env.AZURE_BLOB_CONTAINER || 'uploads';

// Helper: Upload + return SAS URL
const uploadToAzure = async (file) => {
  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();

    const blobName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${file.name}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Upload
    await blockBlobClient.uploadData(file.data, {
      blobHTTPHeaders: { blobContentType: file.mimetype },
    });

    // SAS (1 hour)
    const sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: ContainerSASPermissions.parse("r"),
        expiresOn: new Date(Date.now() + 3600 * 1000),
        protocol: SASProtocol.Https,
      },
      blobServiceClient.credential
    ).toString();

    return `${blockBlobClient.url}?${sasToken}`;
  } catch (err) {
    console.error('Azure Blob upload error:', err);
    throw new Error('Failed to upload file to Azure Blob');
  }
};

// Create report
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

      const pool = await poolPromise;
      const request = pool.request();

      request.input('user_id', sql.Int, req.user.user_id);
      request.input('type', sql.VarChar(50), type);
      request.input('latitude', sql.Float, latitude);
      request.input('longitude', sql.Float, longitude);
      request.input('photo_url', sql.VarChar(sql.MAX), photoUrl); // store SAS URL
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
