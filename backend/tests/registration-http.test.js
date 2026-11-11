import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createRegistrationLimiter } from '../src/modules/auth/registration.limiter.js';

const body = () => ({ firstName: 'Prueba', lastName: 'Aislada', email: 'prueba.aislada@tecsup.edu.pe',
  career: 'Carrera autorizada', cycle: 3, password: 'test-only-secret',
  termsAccepted: true, termsVersion: '1.0.0', privacyVersion: '1.0.0' });
async function withApp(work) {
  const app = createApp({ database: { check: async () => {} }, origins: ['http://localhost:5173'] });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await work(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve())); }
}

test('service validates before hashing, stamps server consent and exposes an explicit DTO', async () => {
  const date = new Date('2026-11-09T12:00:00Z');
  let calls = 0;
  const service = createAuthService({ async createStudent(input) {
    calls++;
    assert.equal(input.password, undefined);
    assert.equal(input.termsAcceptedAt, date);
    assert.equal(input.termsVersion, '1.0.0');
    assert.equal(input.privacyVersion, '1.0.0');
    assert.equal(input.passwordHash, 'not-plaintext');
    return { email: input.email, passwordHash: input.passwordHash, id: 'internal' };
  } }, { now: () => date, hash: async (password) => { assert.equal(password, body().password); return 'not-plaintext'; } });
  const result = await service.register(body());
  assert.deepEqual(result, { user: { email: body().email, role: 'student', emailVerified: false, onboardingComplete: false } });
  await assert.rejects(service.register({ ...body(), role: 'ADMIN' }), (e) => e.code === 'VALIDATION_ERROR');
  assert.equal(calls, 1);
});

test('HTTP rejects invalid consent, extra properties and domains with public field errors before persistence', async () => {
  await withApp(async (base) => {
    for (const patch of [{ termsAccepted: false }, { termsVersion: 'arbitrary' }, { privacyVersion: 'old' },
      { role: 'ADMIN' }, { credits: 20 }, { email: 'prueba.aislada+alias@tecsup.edu.pe' }]) {
      const response = await fetch(`${base}/api/auth/register`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body(), ...patch }) });
      assert.equal(response.status, 422);
      const error = (await response.json()).error;
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.equal(typeof error.fields, 'object');
      assert.ok(!JSON.stringify(error).includes(body().password));
    }
  });
});

test('HTTP requires JSON, rejects unapproved browser origins and retains safe 404', async () => {
  await withApp(async (base) => {
    assert.equal((await fetch(`${base}/api/auth/register`, { method: 'POST', body: 'text' })).status, 415);
    const denied = await fetch(`${base}/api/auth/register`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.invalid' }, body: JSON.stringify(body()) });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    assert.equal((await fetch(`${base}/missing`)).status, 404);
  });
});

test('rate limiter enforces IP/email windows, Retry-After, bounded capacity and expiration', () => {
  let clock = 1000;
  const limiter = createRegistrationLimiter({ now: () => clock, windowMs: 1000, ipLimit: 3, emailLimit: 1, capacity: 4 });
  const headers = {};
  const response = { set: (key, value) => { headers[key] = value; } };
  const invoke = (ip, email) => { let error; limiter({ ip, body: { email } }, response, (e) => { error = e; }); return error; };
  assert.equal(invoke('a', ' USER@EXAMPLE.COM '), undefined);
  assert.equal(invoke('b', 'user@example.com').code, 'RATE_LIMITED');
  assert.equal(headers['Retry-After'], '1');
  assert.equal(invoke('a', 'other@example.com'), undefined);
  assert.equal(invoke('a', 'third@example.com'), undefined);
  assert.equal(invoke('a', 'other@example.com').code, 'RATE_LIMITED');
  assert.equal(invoke('c', 'new@example.com').code, 'SERVICE_UNAVAILABLE');
  clock += 1000;
  assert.equal(invoke('c', 'user@example.com'), undefined);
});
