import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { createDatabase } from '../src/config/db.js';
import { synchronizeAcademicCatalog } from '../database/academic-catalog.js';

let database;
try {
  const [mode, envPath, ...extra] = process.argv.slice(2);
  if (!['--check', '--apply'].includes(mode) || !envPath || extra.length) throw new Error('Invalid arguments');
  const config = dotenv.parse(await readFile(envPath));
  const isolated = config.DB_NAME === 'skillswap_ai_test_auth' && config.DB_USER === 'skillswap_test_app';
  const main = config.DB_NAME === 'skillswap_ai' && config.DB_USER === 'skillswap_app';
  if ((!isolated && !main) || config.DB_HOST !== '127.0.0.1' || config.DB_PORT !== '3306' || !config.DB_PASSWORD ||
      (mode === '--apply' && process.env.CATALOG_ALLOW_WRITE !== 'yes')) throw new Error('Catalog target/authorization rejected');
  database = createDatabase({ host: config.DB_HOST, port: 3306, database: config.DB_NAME,
    user: config.DB_USER, password: config.DB_PASSWORD });
  const [[identity]] = await database.execute('SELECT CURRENT_USER() AS account, DATABASE() AS db');
  if (identity.account !== `${config.DB_USER}@127.0.0.1` || identity.db !== config.DB_NAME) throw new Error('Identity mismatch');
  console.log(JSON.stringify(await synchronizeAcademicCatalog(database, { apply: mode === '--apply' })));
} catch {
  console.error('Catalog verification failed; no credentials or SQL values exposed. Inspect conflicts locally.');
  process.exitCode = 1;
} finally { if (database) await database.close(); }
