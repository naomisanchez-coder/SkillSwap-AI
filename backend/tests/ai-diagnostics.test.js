import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiDiagnostics, safeAiDiagnostic, codeFingerprint } from '../src/modules/student/ai.diagnostics.js';
import { createGeminiGenerateContentClient } from '../src/adapters/gemini-generate-content.js';
const config = { provider: 'gemini', model: 'gemini-3.8-flash', apiKey: 'offline-secret-fixture-never-sent', maximumOutputTokens: 300, timeoutMs: 20 };
const input = { instructions: 'private instructions', input: [{ role: 'user', content: 'private question' }] };
test('registro seguro: identifica arranque y conserva solo metadatos permitidos del último evento', () => {
  const written = [], logged = [];
  const diagnostics = createAiDiagnostics({ AI_ENABLED: 'true', AI_PROVIDER: 'gemini', AI_MODEL: config.model, GEMINI_API_KEY: config.apiKey, AI_MAX_OUTPUT_TOKENS: '300' }, { write: value => written.push(value), log: value => logged.push(value), fingerprint: () => 'f'.repeat(64), revision: () => 'a'.repeat(40) });
  diagnostics.start(); diagnostics.record({ provider: 'gemini', operation: 'generateContent', outcome: 'error', category: 'UPSTREAM', status: 503, durationMs: 3084, key: config.apiKey, prompt: 'private question', body: 'private response', cookie: 'private cookie' });
  assert.equal(written[0].runtime.revision, 'a'.repeat(40)); assert.equal(written[1].lastDiagnostic.status, 503);
  assert.equal(written[1].runtime.pid, process.pid); assert.equal(written[1].runtime.credentialPresent, true);
  assert.doesNotMatch(JSON.stringify([written, logged]), /offline-secret|private question|private response|private cookie/);
  const safe = safeAiDiagnostic({ category: config.apiKey, finishReason: config.apiKey, blockReason: config.apiKey });
  assert.doesNotMatch(JSON.stringify(safe), /offline-secret/); assert.equal(safe.category, 'UNKNOWN');
  assert.match(codeFingerprint(), /^[a-f0-9]{64}$/);
});
test('respuestas realistas: no devuelve razonamiento ni mezcla candidatos; registra truncamiento y conteos sin contenido', async () => {
  const events = [];
  const client = createGeminiGenerateContentClient(config, { onDiagnostic: e => events.push(e), async fetchImpl() { return Response.json({ candidates: [{ index: 0, finishReason: 'MAX_TOKENS', content: { role: 'model', parts: [{ thought: true, text: 'private reasoning' }, { text: 'Respuesta parcial real' }] } }, { index: 1, content: { parts: [{ text: 'Otra alternativa' }] } }], usageMetadata: { thoughtsTokenCount: 280, candidatesTokenCount: 20 } }); } });
  assert.equal(await client.respond(input), 'Respuesta parcial real');
  assert.equal(events[0].finishReason, 'MAX_TOKENS'); assert.equal(events[0].candidateCount, 2); assert.equal(events[0].thoughtsTokenCount, 280);
  assert.doesNotMatch(JSON.stringify(events), /private reasoning|Respuesta parcial|Otra alternativa/);
});
test('vacías, bloqueadas y solo razonamiento: diagnóstico distingue motivo sin publicar cuerpos', async () => {
  for (const body of [{ candidates: [] }, { promptFeedback: { blockReason: 'SAFETY' }, candidates: [] }, { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: 'blocked partial' }] } }] }, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ thought: true, text: 'private reasoning' }] } }] }]) {
    const events = []; let calls = 0;
    const client = createGeminiGenerateContentClient(config, { onDiagnostic: e => events.push(e), async fetchImpl() { calls++; return Response.json(body); } });
    await assert.rejects(client.respond(input), error => error.kind === 'INVALID_RESPONSE');
    assert.equal(calls, 1); assert.equal(events[0].status, 200); assert.equal(events[0].category, 'INVALID_RESPONSE');
    if (body.promptFeedback) assert.equal(events[0].blockReason, 'SAFETY');
    assert.doesNotMatch(JSON.stringify(events), /private reasoning|blocked partial/);
  }
});
test('timeout abarca lectura del cuerpo y conserva HTTP 200 cuando ya se recibieron cabeceras', async () => {
  const events = [];
  const client = createGeminiGenerateContentClient({ ...config, timeoutMs: 5 }, { onDiagnostic: e => events.push(e), async fetchImpl(_url, options) { return { ok: true, status: 200, json() { return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('private detail'), { name: 'AbortError' })))); } }; } });
  await assert.rejects(client.respond(input), error => error.kind === 'TIMEOUT');
  assert.equal(events.length, 1); assert.equal(events[0].category, 'TIMEOUT'); assert.equal(events[0].status, 200);
});
test('JSON inválido conserva estado remoto y emite solo una categoría segura', async () => {
  const events = [];
  const client = createGeminiGenerateContentClient(config, { onDiagnostic: e => events.push(e), async fetchImpl() { return { ok: true, status: 200, async json() { throw new Error('private body'); } }; } });
  await assert.rejects(client.respond(input), error => error.kind === 'INVALID_RESPONSE');
  assert.equal(events.length, 1); assert.equal(events[0].status, 200); assert.equal(events[0].category, 'INVALID_RESPONSE');
});
