import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Excluir suites con escrituras reales y no heredar credenciales ni sus activadores.
const cwd = fileURLToPath(new URL('../', import.meta.url));
const files = readdirSync(new URL('../tests/', import.meta.url))
  .filter(file => file.endsWith('.test.js') && !file.includes('.integration.'))
  .sort().map(file => `tests/${file}`);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(DATABASE_TEST_|MIGRATION_TEST_|DB_|SMTP_|OTP_|AI_|GEMINI_|OPENAI_|PASSWORD_RECOVERY_|SESSION_|LOGIN_)/.test(key)));
const result = spawnSync(process.execPath, ['--test', ...files], { cwd, env, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
