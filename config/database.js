// config/database.js
const sql = require('mssql');

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST, // e.g., myserver.database.windows.net
  database: process.env.DB_NAME,
  options: {
    encrypt: true, // Required for Azure SQL
    enableArithAbort: true,
    trustServerCertificate: false, // Use false for production with Azure; true only for local testing
  },
  pool: {
    max: 10, // Adjust based on load
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then((pool) => {
    console.log('Connected to Azure SQL Database');
    return pool;
  })
  .catch((err) => {
    console.error('Database Connection Failed!', err);
    throw err; // Re-throw to handle in the calling code
  });

module.exports = { sql, poolPromise };