const pool = require('../config/database'); // This should be configured for Azure SQL using mssql
const geolib = require('geolib');
const { sendNotificationToResponders } = require('./notification');

async function assignToNearestDriver(reportId, reportDetails) {
  const { latitude, longitude, type, photoUrl, description } = reportDetails;

  // Query to get available drivers (T-SQL compatible)
  const driversResult = await pool.request().query(`
    SELECT d.driver_id, d.user_id, d.latitude, d.longitude, d.status AS driver_status
    FROM drivers d
    WHERE d.status = 'Available' AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL
  `);

  const drivers = driversResult.recordset;

  if (drivers.length === 0) throw new Error('No available drivers with location data');

  const nearest = drivers.reduce((closest, driver) => {
    const distance = geolib.getDistance(
      { latitude, longitude },
      { latitude: driver.latitude, longitude: driver.longitude }
    );
    return !closest || distance < closest.distance
      ? { driver, distance }
      : closest;
  }, null);

  const { driver_id } = nearest.driver;

  // Insert assignment using parameterized query (T-SQL with named parameters)
  await pool.request()
    .input('reportId', reportId)
    .input('driverId', driver_id)
    .query(`
      INSERT INTO report_assignments (report_id, driver_id, status)
      VALUES (@reportId, @driverId, 'Pending')
    `);

  await sendNotificationToResponders({
    reportId,
    type,
    latitude,
    longitude,
    photoUrl,
    description
  });

  return driver_id;
}

module.exports = { assignToNearestDriver };