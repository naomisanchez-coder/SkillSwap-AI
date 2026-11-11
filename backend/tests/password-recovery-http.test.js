import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';

const origin = 'http://localhost:5173';
async function serve(recoveryService) {
  const server = createApp({ database: { check: async () => {} }, origins: [origin], recoveryService })
    .listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
const close = server => new Promise(resolve => server.close(resolve));

test('recovery HTTP publishes exact 202/200 DTOs without cookies or codes', async () => {
  const recoveryId = randomUUID();
  const recoveryService = {
    async request() { return { status: 'accepted', recoveryId,
      message: 'Si corresponde, recibirás instrucciones para recuperar tu cuenta.' }; },
    async reset() { return { status: 'password_updated', nextAction: 'login' }; },
  };
  const { server, base } = await serve(recoveryService);
  try {
    const headers = { 'Content-Type': 'application/json', 'X-CSRF-Protection': '1', Origin: origin };
    const requested = await fetch(`${base}/api/auth/password-recovery/request`, { method: 'POST', headers,
      body: JSON.stringify({ email: 'user@example.com' }) });
    assert.equal(requested.status, 202);
    assert.equal(requested.headers.get('set-cookie'), null);
    const requestBody = await requested.json();
    assert.equal(requestBody.recoveryId, recoveryId);
    assert.equal(JSON.stringify(requestBody).includes('123456'), false);
    const reset = await fetch(`${base}/api/auth/password-recovery/reset`, { method: 'POST', headers,
      body: JSON.stringify({ email: 'user@example.com', recoveryId, code: '123456',
        newPassword: 'NuevaClave2026!' }) });
    assert.equal(reset.status, 200);
    assert.deepEqual(await reset.json(), { status: 'password_updated', nextAction: 'login' });
    assert.equal(reset.headers.get('set-cookie'), null);
  } finally { await close(server); }
});

test('recovery HTTP requires JSON, anti-simple header, approved origin and configured service', async () => {
  const { server, base } = await serve(undefined);
  try {
    const missing = await fetch(`${base}/api/auth/password-recovery/request`, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-CSRF-Protection': '1', Origin: origin },
    body: JSON.stringify({ email: 'user@example.com' }) });
    assert.equal(missing.status, 503);
    const csrf = await fetch(`${base}/api/auth/password-recovery/request`, { method: 'POST', headers: {
      'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ email: 'user@example.com' }) });
    assert.equal(csrf.status, 403);
    const forbidden = await fetch(`${base}/api/auth/password-recovery/request`, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-CSRF-Protection': '1', Origin: 'https://evil.invalid' },
    body: JSON.stringify({ email: 'user@example.com' }) });
    assert.equal(forbidden.status, 403);
  } finally { await close(server); }
});
