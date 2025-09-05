const express = require('express');
const { sql, poolPromise } = require('../config/database'); // CommonJS import
const { BlobServiceClient, generateBlobSASQueryParameters, ContainerSASPermissions, SASProtocol } = require('@azure/storage-blob');
const crypto = require('crypto');
const dotenv = require('dotenv');
dotenv.config();

const router = express.Router();
console.log('driverVerificationRouter loaded');

// Azure Blob setup
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerName = process.env.AZURE_BLOB_CONTAINER || 'uploads';

// Helper: Upload file to Azure Blob privately and return SAS URL
const uploadToAzure = async (file) => {
  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists({}); // Private container

    const blobName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${file.name}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Upload file
    await blockBlobClient.uploadData(file.data, {
      blobHTTPHeaders: { blobContentType: file.mimetype },
    });

    // Generate SAS URL valid for 1 hour
    const sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: ContainerSASPermissions.parse("r"),
        expiresOn: new Date(Date.now() + 3600 * 1000), // 1 hour
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

// Middleware for request logging
router.use((req, res, next) => {
  console.log(`DriverVerification Route: ${req.method} ${req.path}`);
  next();
});

// Submit driver verification
router.post('/submit', async (req, res) => {
  try {
    const { licenseNumber, ambulanceRegistration, address, driverId, userId } = req.body;

    if (!licenseNumber || !ambulanceRegistration || !address || (!driverId && !userId)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!req.files || !req.files.idProof || !req.files.license) {
      return res.status(400).json({ error: 'Missing required files: idProof and license' });
    }

    const idProof = req.files.idProof;
    const license = req.files.license;

    if (!idProof.mimetype.includes('jpeg') || !license.mimetype.includes('jpeg')) {
      return res.status(400).json({ error: 'Only JPG files are allowed' });
    }

    if (idProof.size > 5 * 1024 * 1024 || license.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Files must be smaller than 5MB' });
    }

    // Resolve driver_id if only user_id is provided
    let resolvedDriverId = driverId;
    if (!resolvedDriverId && userId) {
      const pool = await poolPromise;
      const driverResult = await pool.request()
        .input('userId', sql.Int, userId)
        .query('SELECT driver_id FROM drivers WHERE user_id = @userId');

      if (driverResult.recordset.length === 0) {
        return res.status(400).json({ error: 'No driver profile found for the provided userId' });
      }
      resolvedDriverId = driverResult.recordset[0].driver_id;
    }

    if (!resolvedDriverId) {
      return res.status(400).json({ error: 'Invalid driverId or userId' });
    }

    // Upload files to Azure Blob
    const idProofUrl = await uploadToAzure(idProof);
    const licenseUrl = await uploadToAzure(license);

    // Start transaction
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Update users table
      await transaction.request()
        .input('address', sql.VarChar, address)
        .input('userId', sql.Int, userId)
        .input('role', sql.VarChar, 'Driver')
        .query('UPDATE users SET address = @address, proof_uploaded = 1 WHERE user_id = @userId AND role = @role');

      // Insert or update verifications table
      const existingResult = await transaction.request()
        .input('driverId', sql.Int, resolvedDriverId)
        .query('SELECT verification_id FROM verifications WHERE driver_id = @driverId');

      if (existingResult.recordset.length > 0) {
        await transaction.request()
          .input('idProofUrl', sql.VarChar, idProofUrl)
          .input('licenseUrl', sql.VarChar, licenseUrl)
          .input('status', sql.VarChar, 'Pending')
          .input('driverId', sql.Int, resolvedDriverId)
          .query('UPDATE verifications SET id_proof = @idProofUrl, drivers_license = @licenseUrl, status = @status, created_at = GETDATE() WHERE driver_id = @driverId');
      } else {
        await transaction.request()
          .input('driverId', sql.Int, resolvedDriverId)
          .input('idProofUrl', sql.VarChar, idProofUrl)
          .input('licenseUrl', sql.VarChar, licenseUrl)
          .input('status', sql.VarChar, 'Pending')
          .query('INSERT INTO verifications (driver_id, id_proof, drivers_license, status, created_at) VALUES (@driverId, @idProofUrl, @licenseUrl, @status, GETDATE())');
      }

      // Insert or update ambulances table
      await transaction.request()
        .input('vehicleNumber', sql.VarChar, ambulanceRegistration)
        .input('driverId', sql.Int, resolvedDriverId)
        .query('MERGE ambulances WITH (HOLDLOCK) AS target USING (VALUES (@driverId)) AS source (driver_id) ON (target.driver_id = source.driver_id) WHEN MATCHED THEN UPDATE SET vehicle_number = @vehicleNumber WHEN NOT MATCHED THEN INSERT (vehicle_number, driver_id) VALUES (@vehicleNumber, @driverId);');

      // Update drivers table
      await transaction.request()
        .input('licenseNumber', sql.VarChar, licenseNumber)
        .input('driverId', sql.Int, resolvedDriverId)
        .query('UPDATE drivers SET license_number = @licenseNumber WHERE driver_id = @driverId');

      await transaction.commit();
      console.log(`Verification submitted successfully for driverId: ${resolvedDriverId}`);
      res.status(200).json({ message: 'Verification submitted successfully', status: 'Pending' });

    } catch (err) {
      await transaction.rollback();
      throw err;
    }

  } catch (error) {
    console.error('Error submitting verification:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

module.exports = router;
