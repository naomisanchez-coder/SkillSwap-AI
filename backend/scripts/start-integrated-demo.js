import { readFile, stat, lstat } from 'node:fs/promises';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import dotenv from 'dotenv';
import { applyDemoAiConfig, installDemoEnvironment } from './demo-ai-config.js';
import { validateEnv } from '../src/config/env.js';
import { readOtpConfig, readEmailConfig } from '../src/config/email.js';
import { readLoginSecurityConfig } from '../src/config/login-security.js';
import { readSessionSecurityConfig } from '../src/config/session-security.js';
import { readPasswordRecoveryConfig } from '../src/config/password-recovery.js';
import { readAiConfig } from '../src/config/ai.js';

export function mergeDemoValues(target, values) {
  for (const [key, value] of Object.entries(values)) {
    // La plantilla demo deja vacías estas claves: heredar la configuración privada válida.
    if (value === '' && /^(LOGIN_RATE_HMAC_KEY_HEX|SESSION_CSRF_KEY_HEX|PASSWORD_RECOVERY_|OTP_)/.test(key)) continue;
    target[key] = value;
  }
  return target;
}

export const localAiOverrideFile = new URL('../.env.ai.override.local', import.meta.url);
export async function readLocalAiOverride(path = localAiOverrideFile) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) throw new Error('El override de IA debe ser un archivo privado 0600.');
    const values = dotenv.parse(await readFile(path));
    if (Object.keys(values).some(key => !['AI_MODEL', 'AI_TIMEOUT_MS'].includes(key))) throw new Error('El override local solo admite modelo y timeout de IA.');
    return values;
  } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

// Solo lectura de la configuración privada existente; nunca copiar claves a React.
export async function readDemoConfig(source, { smtp = false } = {}) {
  const config = {};
  let privateAi;
  for (const name of ['.env', '.env.smtp.local', '.env.ai.local', '.env.demo.local']) {
    const path = resolve(source, name);
    const info = await stat(path);
    if (!info.isFile() || (info.mode & 0o077) !== 0) throw new Error(`Permisos privados requeridos para ${name}: 0600.`);
    const values = dotenv.parse(await readFile(path));
    if (name === '.env.ai.local') privateAi = values;
    mergeDemoValues(config, values);
  }
  if (config.DB_NAME !== 'skillswap_ai_demo' || config.DB_USER !== 'skillswap_demo_app') throw new Error('Se requiere la identidad exclusiva de skillswap_ai_demo.');
  if (!['localhost', '127.0.0.1', '::1'].includes(config.DB_HOST)) throw new Error('La base debe ser local.');
  const storage = config.PRIVATE_STORAGE_ROOT;
  if (!storage || !isAbsolute(storage) || !(await lstat(storage)).isDirectory() || (await lstat(storage)).isSymbolicLink() || ((await lstat(storage)).mode & 0o077) !== 0) throw new Error('Falta el almacenamiento demo existente; no se crea ni sustituye automáticamente.');
  const result = { ...applyDemoAiConfig(config, privateAi ?? {}, await readLocalAiOverride()), PRIVATE_STORAGE_READ_ONLY_ROOT: storage, PRIVATE_STORAGE_ROOT: resolve(dirname(fileURLToPath(import.meta.url)), '../.private-storage/demo'), NODE_ENV: 'development', HOST: '127.0.0.1', CORS_ORIGIN: 'http://localhost:5173', SMTP_ENABLED: smtp ? 'true' : 'false' };
  validateEnv(result); readOtpConfig(result); readLoginSecurityConfig(result); readSessionSecurityConfig(result); readPasswordRecoveryConfig(result); readAiConfig(result);
  if (smtp) readEmailConfig(result);
  return result;
}

async function assertPortAvailable(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Puerto inválido.');
  await new Promise((resolvePromise, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error('El puerto está ocupado. Detén el Express anterior antes de continuar.')));
    probe.listen(port, '127.0.0.1', () => probe.close(resolvePromise));
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const source = process.env.SKILLSWAP_DEMO_SOURCE ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../../PreTesis-SkillSwap/backend');
    const config = await readDemoConfig(source, { smtp: process.argv.includes('--smtp') });
    // Un servidor en otro puerto también puede usar esta base. Verificar procesos antes del arranque.
    if (process.argv.includes('--check')) {
      console.info('Configuración demo y permisos privados correctos. No se abrió MySQL, SMTP ni Gemini.');
    } else {
      await assertPortAvailable(Number(config.PORT));
      // Sustituir todo el entorno de aplicación por la configuración demo verificada.
      installDemoEnvironment(config);
      console.info(`Demo local: http://localhost:${config.PORT}; SMTP ${config.SMTP_ENABLED === 'true' ? 'habilitado por --smtp' : 'deshabilitado'}.`);
      console.info('Gemini: configuración presente y válida; salida limitada a 300 tokens; sin llamada de diagnóstico al proveedor.');
      await import('../src/server.js');
    }
  } catch (error) {
    console.error(error.code === 'ENOENT' ? 'No se encontró la configuración o el almacenamiento demo. Revisa SKILLSWAP_DEMO_SOURCE.' : error.message);
    process.exitCode = 1;
  }
}
