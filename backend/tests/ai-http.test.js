import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { PublicError } from '../src/errors/PublicError.js';

const token = 'a'.repeat(64), csrf = 'b'.repeat(64);

async function withApp({ configured = true, role = 'student' } = {}, work) {
  const calls = [];
  const sessionService = { async authenticate() { return { user: { id: 'student-id', role }, session: {}, inspected: {} }; },
    async validateCsrf(_auth, _token, supplied) { if (supplied !== csrf) throw new PublicError('CSRF_INVALID'); } };
  const studentService = { async profile() { return {}; } };
  const aiService = configured ? { async chat(id, body) { calls.push([id, body]); return { reply: 'Respuesta',
    grounding: { skills: 0, mentors: 0 }, rateLimit: { remaining: 9, resetsAt: '2027-01-01T00:00:00.000Z' } }; } } : undefined;
  const app = createApp({ database: { check: async () => {} }, origins: ['http://localhost:5173'],
    sessionService, studentService, aiService, cookie: { name: 'skillswap_session' } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try { await work(`http://127.0.0.1:${server.address().port}`, calls); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

function request(base, headers = {}, body = { message: 'Hola', history: [] }) {
  return fetch(`${base}/api/student/ai/chat`, { method: 'POST', headers: { Cookie: `skillswap_session=${token}`,
    'Content-Type': 'application/json', Origin: 'http://localhost:5173', ...headers }, body: JSON.stringify(body) });
}

test('AI chat requires an authenticated student, approved origin and session CSRF', async () => {
  await withApp({}, async (base, calls) => {
    assert.equal((await fetch(`${base}/api/student/ai/chat`, { method: 'POST', headers: {
      'Content-Type': 'application/json' }, body: '{"message":"Hola"}' })).status, 401);
    assert.equal((await request(base)).status, 403);
    assert.equal((await request(base, { 'X-CSRF-Token': csrf, Origin: 'https://evil.invalid' })).status, 403);
    const response = await request(base, { 'X-CSRF-Token': csrf });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { message: { role: 'assistant', content: 'Respuesta' },
      grounding: { skills: 0, mentors: 0 }, rateLimit: { remaining: 9, resetsAt: '2027-01-01T00:00:00.000Z' } });
    assert.deepEqual(calls, [['student-id', { message: 'Hola', history: [] }]]);
  });
  await withApp({ role: 'admin' }, async base => assert.equal((await request(base, { 'X-CSRF-Token': csrf })).status, 403));
});

test('AI chat fails closed when provider configuration is absent', async () => {
  await withApp({ configured: false }, async base => {
    assert.equal((await request(base, { 'X-CSRF-Token': csrf })).status, 503);
  });
});
