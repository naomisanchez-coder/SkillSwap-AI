import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { createDatabase } from '../src/config/db.js';
import { createLocalPrivateStorage } from '../src/adapters/private-storage.js';
import { inspectDemoEnvironment, provisionDemoMentors } from '../database/demo-environment.js';

let database;
try {
  const [mode, envPath, ...extra] = process.argv.slice(2);
  if (!['--check', '--apply'].includes(mode) || !envPath || extra.length) throw new Error('Invalid arguments');
  const config = dotenv.config({ path: resolve(envPath), override: true, quiet: true }).parsed ?? {};
  if (config.DB_HOST !== '127.0.0.1' || config.DB_PORT !== '3306' ||
      config.DB_NAME !== 'skillswap_ai_demo' || config.DB_USER !== 'skillswap_demo_app' ||
      !config.DB_PASSWORD || !config.PRIVATE_STORAGE_ROOT ||
      (mode === '--apply' && process.env.DEMO_MENTORS_ALLOW_WRITE !== 'yes')) {
    throw new Error('Invalid demo environment configuration');
  }
  database = createDatabase({ host: config.DB_HOST, port: Number(config.DB_PORT), database: config.DB_NAME,
    user: config.DB_USER, password: config.DB_PASSWORD });
  const initial = await inspectDemoEnvironment(database);
  if (mode === '--check') console.info(JSON.stringify({ apply: false, complete: initial.complete,
    existingMentors: initial.rows.length, administratorReady: initial.admins.length === 1 }));
  else {
    const result = await provisionDemoMentors(database, createLocalPrivateStorage({ root: config.PRIVATE_STORAGE_ROOT }));
    console.info(JSON.stringify({ apply: true, ...result }));
  }
} catch {
  console.error('Demo mentor preparation failed; no credentials or private identifiers exposed.');
  process.exitCode = 1;
} finally {
  await database?.close();
}
