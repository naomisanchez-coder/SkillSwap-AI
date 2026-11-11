import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDemoAiConfig, installDemoEnvironment } from '../scripts/demo-ai-config.js';
import { readAiConfig } from '../src/config/ai.js';
const ai = { AI_ENABLED: 'true', AI_PROVIDER: 'gemini', AI_MODEL: 'gemini-validated-fixture', GEMINI_API_KEY: 'mock-private-key-for-offline-tests' };
test('demo: Gemini privado prevalece sobre plantilla y conserva SMTP, OTP e identidad demo', () => {
  const merged = applyDemoAiConfig({ AI_ENABLED: 'false', AI_MODEL: '', SMTP_ENABLED: 'true', OTP_HMAC_KEY_HEX: 'a'.repeat(64), DB_NAME: 'skillswap_ai_demo' }, { ...ai, AI_MAX_OUTPUT_TOKENS: '128' });
  assert.equal(merged.AI_ENABLED, 'true'); assert.equal(merged.AI_MODEL, ai.AI_MODEL);
  assert.equal(merged.SMTP_ENABLED, 'true'); assert.equal(merged.OTP_HMAC_KEY_HEX, 'a'.repeat(64));
  assert.equal(readAiConfig(merged).maximumOutputTokens, 300); assert.equal(readAiConfig(merged).timeoutMs, 30000);
  const target = { AI_API_KEY: 'stale-openai-fixture', GEMINI_API_KEY: 'stale', PATH: '/fixture' };
  installDemoEnvironment(merged, target);
  assert.equal(target.GEMINI_API_KEY, ai.GEMINI_API_KEY); assert.equal(target.AI_API_KEY, undefined);
  assert.equal(target.DB_NAME, 'skillswap_ai_demo'); assert.equal(target.PATH, '/fixture');
});
test('demo: configuración ausente o deshabilitada falla antes de iniciar Express', () => {
  for (const value of [{}, { ...ai, AI_ENABLED: 'false' }, { ...ai, GEMINI_API_KEY: '' }]) assert.throws(() => applyDemoAiConfig({}, value));
});
