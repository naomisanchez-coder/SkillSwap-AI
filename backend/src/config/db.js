import mysql from 'mysql2/promise';

function validateStatement(sql, values) {
  // Repository-owned SQL only. Parameters bind values, never identifiers.
  if (typeof sql !== 'string' || !/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql) || !Array.isArray(values)) {
    throw new TypeError('Expected a data statement and an array of bound values');
  }
}

export function createDatabase(config, { ssl, poolFactory = mysql.createPool } = {}) {
  const tls = ssl ?? config.ssl;
  if (tls && tls.rejectUnauthorized === false) throw new Error('TLS verification is required');
  const pool = poolFactory({
    ...config, ...(tls ? { ssl: tls } : {}), timezone: 'Z',
    waitForConnections: true, connectionLimit: 5, queueLimit: 10,
    connectTimeout: 5000, multipleStatements: false,
  });

  async function withConnection(work) {
    const connection = await pool.getConnection();
    let discard = false;
    try {
      try {
        // Await session initialization on every checkout, including reused connections.
        await connection.query({ sql: "SET SESSION time_zone = '+00:00'", timeout: 5000 });
      } catch (error) {
        discard = true;
        throw error;
      }
      return await work(connection, () => { discard = true; });
    } catch (error) {
      if (error?.fatal) discard = true;
      throw error; // Internal callers retain identity; HTTP middleware never exposes driver errors.
    } finally {
      if (discard) connection.destroy();
      else connection.release();
    }
  }

  function execute(sql, values = []) {
    validateStatement(sql, values);
    return withConnection((connection) => connection.execute({ sql, timeout: 5000 }, values));
  }

  async function transaction(work) {
    if (typeof work !== 'function') throw new TypeError('Expected a transaction callback');
    return withConnection(async (connection, discard) => {
      let begun = false;
      let active = true;
      const scope = Object.freeze({
        execute(sql, values = []) {
          if (!active) throw new Error('Transaction scope is closed');
          validateStatement(sql, values);
          return connection.execute({ sql, timeout: 5000 }, values);
        },
      });
      try {
        try {
          await connection.beginTransaction();
          begun = true;
        } catch (error) {
          discard();
          throw error;
        }
        const result = await work(scope);
        active = false;
        try {
          await connection.commit();
        } catch (error) {
          // A lost COMMIT acknowledgement can have an uncertain outcome: never retry here.
          discard();
          throw error;
        }
        return result;
      } catch (error) {
        active = false;
        if (begun) {
          try { await connection.rollback(); } catch { discard(); }
        }
        throw error;
      } finally {
        active = false;
      }
    });
  }

  return Object.freeze({
    execute,
    transaction,
    async check() {
      if (!config.password) throw new Error('Database credentials are not configured');
      await execute('SELECT 1');
    },
    close: () => pool.end(),
  });
}
