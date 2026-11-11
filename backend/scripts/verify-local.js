import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';

try {
  const config = dotenv.parse(await readFile(new URL('../.env.test.local', import.meta.url)));
  if (config.DB_HOST !== '127.0.0.1' || config.DB_PORT !== '3306' ||
      config.DB_NAME !== 'skillswap_ai_test_auth' || config.DB_USER !== 'skillswap_test_app' ||
      !config.DB_PASSWORD) throw new Error('Unsafe isolated target');
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(MIGRATION_TEST_|DATABASE_TEST_)/.test(key)) delete env[key];
  Object.assign(env, { DATABASE_TEST_DB: config.DB_NAME, DATABASE_TEST_USER: config.DB_USER,
    DATABASE_TEST_PASSWORD: config.DB_PASSWORD });
  const child = spawn(process.execPath, ['--test', ...process.argv.slice(2)], {
    cwd: new URL('../', import.meta.url), env, stdio: 'inherit',
  });
  child.on('error', () => { console.error('Could not start isolated tests'); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
} catch {
  console.error('Isolated test configuration rejected; no credentials exposed.');
  process.exitCode = 1;
}
