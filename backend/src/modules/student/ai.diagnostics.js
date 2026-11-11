import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const diagnosticFile = new URL('../../../.ai-diagnostic.log', import.meta.url);
const root = new URL('../../../../', import.meta.url);
const files = ['backend/src/server.js', 'backend/src/modules/student/ai.factory.js', 'backend/src/config/ai.js', 'backend/src/modules/student/ai.service.js', 'backend/src/modules/student/ai.controller.js', 'backend/src/modules/student/ai.diagnostics.js', 'backend/src/adapters/gemini-generate-content.js', 'backend/scripts/start-integrated-demo.js', 'backend/scripts/demo-ai-config.js'];
export function codeFingerprint() { const hash = createHash('sha256'); for (const path of files) hash.update(path).update(readFileSync(new URL(path, root))); return hash.digest('hex'); }
export function codeRevision() {
  try {
    const native = '/Applications/Xcode.app/Contents/Developer/usr/bin/git';
    const value = execFileSync(existsSync(native) ? native : 'git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(root), encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim();
    return /^[a-f0-9]{40}$/.test(value) ? value : null;
  } catch { return null; }
}
const categories = new Set(['SUCCESS', 'BAD_REQUEST', 'FORBIDDEN', 'LIMITED', 'UPSTREAM', 'HTTP_ERROR', 'TIMEOUT', 'TRANSPORT', 'INVALID_RESPONSE']);
const finishes = new Set(['STOP', 'MAX_TOKENS', 'SAFETY', 'RECITATION', 'LANGUAGE', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'MALFORMED_FUNCTION_CALL', 'IMAGE_SAFETY', 'FINISH_REASON_UNSPECIFIED']);
const blocks = new Set(['SAFETY', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY', 'BLOCK_REASON_UNSPECIFIED']);
export function safeAiDiagnostic(event) {
  const result = { provider: event.provider === 'gemini' ? 'gemini' : 'unknown', operation: event.operation === 'generateContent' ? 'generateContent' : event.operation === 'listModels' ? 'listModels' : 'unknown', outcome: event.outcome === 'success' ? 'success' : 'error', category: categories.has(event.category) ? event.category : 'UNKNOWN', status: Number.isInteger(event.status) && event.status >= 100 && event.status <= 599 ? event.status : null, durationMs: Number.isFinite(event.durationMs) && event.durationMs >= 0 ? Math.min(Math.round(event.durationMs), 3600000) : null };
  for (const [key, allowed] of [['finishReason', finishes], ['blockReason', blocks]]) if (event[key] !== undefined) result[key] = allowed.has(event[key]) ? event[key] : 'UNKNOWN';
  for (const key of ['candidateCount', 'thoughtsTokenCount', 'candidatesTokenCount']) if (Number.isSafeInteger(event[key]) && event[key] >= 0) result[key] = Math.min(event[key], 10000000);
  return result;
}
export function createAiDiagnostics(source, { write = record => writeFileSync(diagnosticFile, JSON.stringify(record) + '\n', { mode: 0o600 }), log = record => console.info(JSON.stringify(record)), fingerprint = codeFingerprint, revision = codeRevision } = {}) {
  const runtime = { pid: process.pid, startedAt: new Date().toISOString(), revision: revision(), codeFingerprint: fingerprint(), aiEnabled: source.AI_ENABLED === 'true', geminiConfigured: source.AI_PROVIDER === 'gemini', modelPresent: Boolean(source.AI_MODEL), credentialPresent: Boolean(source.GEMINI_API_KEY), outputLimit: Number(source.AI_MAX_OUTPUT_TOKENS || 300) };
  const persist = lastDiagnostic => { try { write({ runtime, lastDiagnostic }); } catch { console.warn('ai_diagnostic_write_failed'); } };
  return { start() { persist(null); log({ event: 'ai_runtime', ...runtime }); }, record(event) { const safe = { ...safeAiDiagnostic(event), at: new Date().toISOString(), pid: runtime.pid }; persist(safe); log({ event: 'ai_provider', ...safe }); } };
}
