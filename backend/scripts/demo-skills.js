import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { readSkillCatalog, synchronizeSkillCatalog } from '../database/skill-catalog.js';
import { createDatabase } from '../src/config/db.js';
export function demoSkillIdentity(config, apply) {
  if (config.DB_NAME !== 'skillswap_ai_demo' || config.DB_USER !== 'skillswap_demo_app' || config.DB_HOST !== '127.0.0.1' || config.DB_PORT !== '3306' || !config.DB_PASSWORD || (apply && config.DEMO_SKILLS_ALLOW_WRITE !== 'yes')) throw new Error('Demo skill target or authorization invalid');
  return { host: config.DB_HOST, port: 3306, database: config.DB_NAME, user: config.DB_USER, password: config.DB_PASSWORD };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let database;
  try {
    const [mode = '--validate', envPath, ...extra] = process.argv.slice(2);
    if (!['--validate', '--check', '--apply'].includes(mode) || extra.length || (mode !== '--validate' && !envPath)) throw new Error('Invalid arguments');
    const catalog = await readSkillCatalog(new URL('../database/catalogs/demo-skills-1.1.0.json', import.meta.url));
    if (catalog.scope !== 'DEMO_ONLY') throw new Error('Demo scope required');
    if (mode === '--validate') console.info(JSON.stringify({ scope: catalog.scope, entries: catalog.skills.length, imported: false }));
    else {
      const config = dotenv.parse(await readFile(envPath));
      database = createDatabase(demoSkillIdentity({ ...config, DEMO_SKILLS_ALLOW_WRITE: process.env.DEMO_SKILLS_ALLOW_WRITE }, mode === '--apply'));
      const [[identity]] = await database.execute('SELECT DATABASE() db, CURRENT_USER() account', []);
      if (identity.db !== 'skillswap_ai_demo' || identity.account !== 'skillswap_demo_app@127.0.0.1') throw new Error('Demo identity mismatch');
      console.info(JSON.stringify(await synchronizeSkillCatalog(database, catalog, { apply: mode === '--apply' })));
    }
  } catch { console.error('No se pudo validar el catálogo demo; no se muestran credenciales.'); process.exitCode = 1; }
  finally { await database?.close(); }
}
