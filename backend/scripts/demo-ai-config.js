import { readAiConfig } from '../src/config/ai.js';

const keys = ['AI_ENABLED', 'AI_PROVIDER', 'AI_MODEL', 'GEMINI_API_KEY', 'AI_RATE_LIMIT_MAX_REQUESTS', 'AI_RATE_LIMIT_WINDOW_SECONDS'];
export function applyDemoAiConfig(config, privateAi, localOverride = {}) {
  if (Object.keys(localOverride).some(key => !['AI_MODEL', 'AI_TIMEOUT_MS'].includes(key))) throw new Error('El override local solo admite modelo y timeout de IA.');
  const result = { ...config };
  for (const key of keys) {
    delete result[key];
    if (privateAi[key] !== undefined) result[key] = privateAi[key];
  }
  // Perfil local acotado: el archivo validado decide modelo/credencial; no se heredan límites de pruebas truncadas.
  if (Object.hasOwn(localOverride, 'AI_MODEL')) result.AI_MODEL = localOverride.AI_MODEL;
  result.AI_MAX_OUTPUT_TOKENS = '300';
  result.AI_TIMEOUT_MS = localOverride.AI_TIMEOUT_MS ?? '30000';
  const ai = readAiConfig(result);
  if (!ai || ai.provider !== 'gemini') throw new Error('La configuración privada de Gemini debe estar presente y habilitada.');
  return result;
}
export function installDemoEnvironment(config, target = process.env) {
  for (const key of Object.keys(target)) if (/^(DB_|SMTP_|AI_|GEMINI_|OPENAI_|SESSION_|OTP_|LOGIN_|PASSWORD_RECOVERY_|PRIVATE_STORAGE_)/.test(key)) delete target[key];
  Object.assign(target, config);
}
