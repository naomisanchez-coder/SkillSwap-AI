import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { createDatabase } from '../src/config/db.js';
import { readSkillCatalog, synchronizeSkillCatalog } from '../database/skill-catalog.js';

let database;
try {
  const [mode, envPath, catalogPath, ...extra] = process.argv.slice(2);
  if (!['--check', '--apply'].includes(mode) || !envPath || !catalogPath || extra.length) throw new Error('Invalid arguments');
  const config = dotenv.parse(await readFile(envPath));
  const isolated = config.DB_NAME === 'skillswap_ai_test_auth' && config.DB_USER === 'skillswap_test_app';
  const main = config.DB_NAME === 'skillswap_ai' && config.DB_USER === 'skillswap_app';
  const demo = config.DB_NAME === 'skillswap_ai_demo' && config.DB_USER === 'skillswap_demo_app';
  if ((!isolated && !main && !demo) || config.DB_HOST !== '127.0.0.1' || config.DB_PORT !== '3306' || !config.DB_PASSWORD ||
      (mode === '--apply' && process.env.SKILL_CATALOG_ALLOW_WRITE !== 'yes')) throw new Error('Catalog target rejected');
  const catalog = await readSkillCatalog(catalogPath);
  if (main && catalog.scope !== 'APPROVED') throw new Error('Demonstration catalog cannot target main');
  if (demo && catalog.scope !== 'DEMO_ONLY') throw new Error('Demo target requires demonstration catalog');
  database = createDatabase({ host: config.DB_HOST, port: 3306, database: config.DB_NAME,
    user: config.DB_USER, password: config.DB_PASSWORD });
  const [[identity]] = await database.execute('SELECT CURRENT_USER() account,DATABASE() db', []);
  if (identity.account !== `${config.DB_USER}@127.0.0.1` || identity.db !== config.DB_NAME) throw new Error('Identity mismatch');
  console.log(JSON.stringify(await synchronizeSkillCatalog(database, catalog, { apply: mode === '--apply' })));
} catch {
  console.error('Skill catalog verification failed; no credentials or catalog values exposed.');
  process.exitCode = 1;
} finally { if (database) await database.close(); }
