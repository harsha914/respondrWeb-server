const express = require('express');
const sql = require('mssql'); // MSSQL for Azure
const router = express.Router();

/**
 * @route GET /api/admin/requests
 * @desc Fetch all driver verification requests
 * @access Admin
 */
router.get('/requests', async (req, res) => {
  try {
    const pool = await sql.connect();
    const result = await pool.request().query(`
      SELECT 
        v.verification_id AS id,
        u.name AS driverName,
        u.email,
        u.phone_number AS phone,
        d.license_number AS licenseNumber,
        a.vehicle_number AS vehicleRegistration,
        v.status,
        v.created_at AS submittedAt,
        v.id_proof AS idProofUrl,
        v.drivers_license AS licenseUrl,
        d.driver_id
      FROM verifications v
      JOIN drivers d ON v.driver_id = d.driver_id
      JOIN users u ON d.user_id = u.user_id
      JOIN ambulances a ON a.driver_id = d.driver_id
    `);

    res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Error fetching admin verification requests:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * @route PUT /api/admin/approve/:id
 * @desc Approve a driver verification request
 * @access Admin
 */
router.put('/approve/:id', async (req, res) => {
  const { id } = req.params;
  const { reviewed_by } = req.body;

  try {
    const pool = await sql.connect();
    const request = pool.request();
    request.input('id', sql.Int, id);
    request.input('reviewed_by', sql.NVarChar, reviewed_by);

    const result = await request.query(`
      UPDATE verifications
      SET status = 'Approved', reviewed_by = @reviewed_by, reviewed_at = GETDATE()
      WHERE verification_id = @id
    `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Verification request not found' });
    }

    res.status(200).json({ message: 'Verification approved successfully' });
  } catch (error) {
    console.error('Error approving verification:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

/**
 * @route PUT /api/admin/reject/:id
 * @desc Reject a driver verification request
 * @access Admin
 */
router.put('/reject/:id', async (req, res) => {
  const { id } = req.params;
  const { reviewed_by, remarks } = req.body;

  try {
    const pool = await sql.connect();
    const request = pool.request();
    request.input('id', sql.Int, id);
    request.input('reviewed_by', sql.NVarChar, reviewed_by);
    request.input('remarks', sql.NVarChar, remarks || null);

    const result = await request.query(`
      UPDATE verifications
      SET status = 'Rejected', reviewed_by = @reviewed_by, reviewed_at = GETDATE(), remarks = @remarks
      WHERE verification_id = @id
    `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Verification request not found' });
    }

    res.status(200).json({ message: 'Verification rejected successfully' });
  } catch (error) {
    console.error('Error rejecting verification:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;
