import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { PublicError } from '../src/errors/PublicError.js';

const token = 'a'.repeat(64), csrf = 'b'.repeat(64);
const profile = { id: 'student-id', firstName: 'Ada', lastName: 'Lovelace', email: 'ada.test@tecsup.edu.pe',
  institution: 'TECSUP', role: 'student', emailVerified: true, career: 'Software', careerCode: 'software',
  cycle: 3, bio: null, interests: [], level: null, goals: null, schedule: null, onboardingComplete: false };

async function withApp({ role = 'student', configured = true } = {}, work) {
  const calls = [];
  const sessionService = configured ? {
    async authenticate(value) { calls.push(['auth', value]); return { user: { ...profile, role }, session: {}, inspected: {} }; },
    async validateCsrf(auth, value, supplied) { calls.push(['csrf', auth.user.id, value, supplied]); if (supplied !== csrf) throw new PublicError('CSRF_INVALID'); },
  } : undefined;
  const studentService = configured ? {
    async profile(id) { calls.push(['profile', id]); return profile; },
    async updateProfile(id, body) { calls.push(['update', id, body]); return { ...profile, ...body }; },
    async onboarding(id) { calls.push(['onboarding', id]); return { interests: [], level: null, schedule: null, complete: false }; },
    async completeOnboarding(id, body) { calls.push(['complete', id, body]); return { ...body, complete: true }; },
    async catalog() { calls.push(['catalog']); return { careers: [] }; },
  } : undefined;
  const app = createApp({ database: { check: async () => {} }, origins: ['http://localhost:5173'],
    sessionService, studentService, cookie: { name: 'skillswap_session' } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try { await work(`http://127.0.0.1:${server.address().port}`, calls); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('student profile requires a valid STUDENT session and derives ownership from it', async () => {
  await withApp({}, async (base, calls) => {
    assert.equal((await fetch(`${base}/api/student/profile`)).status, 401);
    const response = await fetch(`${base}/api/student/profile`, { headers: { Cookie: `skillswap_session=${token}` } });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { profile });
    assert.ok(calls.some(call => call[0] === 'profile' && call[1] === profile.id));
  });
  await withApp({ role: 'admin' }, async base => {
    assert.equal((await fetch(`${base}/api/student/profile`, { headers: { Cookie: `skillswap_session=${token}` } })).status, 403);
  });
});

test('student mutations require approved origin, JSON and session-bound CSRF', async () => {
  await withApp({}, async (base, calls) => {
    const request = (headers) => fetch(`${base}/api/student/profile`, { method: 'PATCH', headers: {
      Cookie: `skillswap_session=${token}`, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ bio: 'Perfil académico' }) });
    assert.equal((await request()).status, 403);
    assert.equal((await request({ 'X-CSRF-Token': csrf, Origin: 'https://evil.invalid' })).status, 403);
    const response = await request({ 'X-CSRF-Token': csrf, Origin: 'http://localhost:5173' });
    assert.equal(response.status, 200);
    assert.ok(calls.some(call => call[0] === 'update' && call[1] === profile.id));
  });
});

test('onboarding and catalog expose only the authenticated student contracts', async () => {
  await withApp({}, async base => {
    const headers = { Cookie: `skillswap_session=${token}` };
    assert.equal((await fetch(`${base}/api/student/onboarding`, { headers })).status, 200);
    assert.equal((await fetch(`${base}/api/student/catalog`, { headers })).status, 200);
    const done = await fetch(`${base}/api/student/onboarding`, { method: 'PUT', headers: { ...headers,
      'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Origin: 'http://localhost:5173' },
    body: JSON.stringify({ interests: ['Python'], level: 'Intermedio', schedule: 'Tardes' }) });
    assert.equal(done.status, 200); assert.equal((await done.json()).onboarding.complete, true);
  });
});

test('student endpoints fail closed when the module is not configured', async () => {
  await withApp({ configured: false }, async base => {
    assert.equal((await fetch(`${base}/api/student/profile`, { headers: { Cookie: `skillswap_session=${token}` } })).status, 503);
  });
});
