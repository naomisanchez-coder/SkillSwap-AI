import mysql from 'mysql2/promise';

export function createDatabase(config, { ssl } = {}) {
  // TLS can be supplied by trusted deployment configuration with CA verification.
  if (ssl && ssl.rejectUnauthorized === false) throw new Error('TLS verification is required');
  const pool = mysql.createPool({
    ...config, ...(ssl ? { ssl } : {}),
    waitForConnections: true, connectionLimit: 5, queueLimit: 10,
    connectTimeout: 5000, multipleStatements: false,
  });
  return {
    async check() {
      if (!config.password) throw new Error('Database credentials are not configured');
      await pool.query({ sql: 'SELECT 1', timeout: 5000 });
    },
    close: () => pool.end(),
  };
}
