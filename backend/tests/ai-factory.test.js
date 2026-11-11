import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfiguredAiService } from '../src/modules/student/ai.factory.js';
const config = { AI_ENABLED: 'true', AI_PROVIDER: 'gemini', AI_MODEL: 'gemini-mock', GEMINI_API_KEY: 'mock-key-with-no-real-provider-access', AI_MAX_OUTPUT_TOKENS: '300' };
const repository = { async publicContext() { return { skills: [], mentors: [] }; } };
test('inicialización usada por Express: Gemini habilitado, sin llamadas al crear, salida acotada y sin store', async () => {
  let calls = 0;
  const service = createConfiguredAiService(config, { repository, transport: { async fetchImpl(_url, options) {
    calls++; const body = JSON.parse(options.body); assert.equal(body.generationConfig.maxOutputTokens, 300); assert.equal(Object.hasOwn(body, 'store'), false);
    return Response.json({ candidates: [{ content: { parts: [{ text: 'Respuesta simulada' }] } }] });
  } } });
  assert.equal(calls, 0); assert.equal((await service.chat('student', { message: 'Hola' })).reply, 'Respuesta simulada'); assert.equal(calls, 1);
  assert.equal(createConfiguredAiService({ AI_ENABLED: 'false' }, { repository }), undefined);
});
test('inicialización: cuota, autorización y proveedor remoto conservan errores seguros y una sola llamada', async () => {
  for (const status of [400, 401, 403, 429, 500, 503]) {
    const diagnostics = []; let calls = 0;
    const service = createConfiguredAiService(config, { repository, onDiagnostic: e => diagnostics.push(e), transport: { async fetchImpl() { calls++; return new Response('private upstream detail', { status }); } } });
    await assert.rejects(service.chat('student', { message: 'Hola' }), error => error.code === (status === 429 ? 'AI_PROVIDER_LIMITED' : 'AI_UNAVAILABLE'));
    assert.equal(calls, 1); assert.equal(diagnostics[0].status, status); assert.doesNotMatch(JSON.stringify(diagnostics), /private upstream detail|mock-key-with/);
  }
});
test('inicialización: timeout simulado se clasifica y OpenAI permanece disponible como alternativa explícita', async () => {
  const diagnostics = [];
  const service = createConfiguredAiService(config, { repository, onDiagnostic: e => diagnostics.push(e), transport: { async fetchImpl() { throw Object.assign(new Error('hidden'), { name: 'AbortError' }); } } });
  await assert.rejects(service.chat('student', { message: 'Hola' }), error => error.code === 'AI_UNAVAILABLE'); assert.equal(diagnostics[0].category, 'TIMEOUT');
  let calls = 0;
  const alternative = createConfiguredAiService({ ...config, AI_PROVIDER: 'openai', AI_API_KEY: 'mock-openai-key-never-sent-externally' }, { repository, transport: { async fetchImpl(url) { calls++; assert.equal(url, 'https://api.openai.com/v1/responses'); return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Alternativa simulada' }] }] }); } } });
  assert.equal((await alternative.chat('student', { message: 'Hola' })).reply, 'Alternativa simulada'); assert.equal(calls, 1);
});

test('modelo ligero configurado: request compatible y respuesta española, sin parámetros extra ni llamadas al construir', async () => {
  const { applyDemoAiConfig } = await import('../scripts/demo-ai-config.js');
  const source = applyDemoAiConfig({}, config, { AI_MODEL: 'gemini-light-offline-fixture' }); let calls = 0;
  const service = createConfiguredAiService(source, { repository, transport: { async fetchImpl(url, options) {
    calls++; assert.ok(url.endsWith('/models/gemini-light-offline-fixture:generateContent'));
    const body = JSON.parse(options.body); assert.deepEqual(body.generationConfig, { maxOutputTokens: 300 });
    assert.equal(body.store, undefined); assert.equal(body.tools, undefined);
    assert.match(body.systemInstruction.parts[0].text, /español/);
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: 'Empieza por un objetivo de aprendizaje pequeño.' }] } }], usageMetadata: { thoughtsTokenCount: 0, candidatesTokenCount: 12 } });
  } } });
  assert.equal(calls, 0); assert.match((await service.chat('student', { message: '¿Cómo estudio mejor?', history: [] })).reply, /objetivo de aprendizaje/); assert.equal(calls, 1);
});
