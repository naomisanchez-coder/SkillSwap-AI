import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { PublicError } from '../src/errors/PublicError.js';

async function withApp(options, work) {
  const app = createApp({ database: { check: async () => {} }, origins: ['http://localhost:5173'], ...options });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try { await work(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const user = { id: 'u', firstName: 'Admin', lastName: 'Local', name: 'Admin Local', email: 'admin@example.com',
  institution: null, career: null, cycle: null, role: 'admin', emailVerified: true, onboardingComplete: null };

test('login sets a host-scoped HttpOnly Lax session cookie and never serializes its token', async () => {
  let receivedIp;
  const loginService = { async login(body, ip) { receivedIp = ip; assert.equal(body.remember, false);
    return { user, csrfToken: 'c'.repeat(64), token: 'a'.repeat(64), remember: false }; } };
  await withApp({ loginService, cookie: { name: 'skillswap_session', secure: false, rememberMaxAge: 2592000000 } }, async base => {
    const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-CSRF-Protection': '1', Origin: 'http://localhost:5173',
      'X-Forwarded-For': '203.0.113.10' }, body: JSON.stringify({ email: user.email, password: 'local', remember: false }) });
    assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    const cookie = response.headers.get('set-cookie'); assert.match(cookie, /^skillswap_session=[0-9a-f]{64}/);
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.doesNotMatch(cookie, /Max-Age/);
    assert.equal(receivedIp, '127.0.0.1');
    const body = await response.json(); assert.deepEqual(body, { user, csrfToken: 'c'.repeat(64) });
    assert.ok(!JSON.stringify(body).includes('a'.repeat(64)));
  });
});

test('remember cookie is persistent; login requires anti-simple header and approved origin', async () => {
  const loginService = { async login() { return { user, csrfToken: 'c'.repeat(64), token: 'a'.repeat(64), remember: true }; } };
  await withApp({ loginService, cookie: { name: 'skillswap_session', secure: true, rememberMaxAge: 2592000000 } }, async base => {
    const data = { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'local', remember: true }) };
    assert.equal((await fetch(`${base}/api/auth/login`, data)).status, 403);
    const denied = await fetch(`${base}/api/auth/login`, { ...data, headers: { ...data.headers,
      'X-CSRF-Protection': '1', Origin: 'https://evil.invalid' } }); assert.equal(denied.status, 403);
    const ok = await fetch(`${base}/api/auth/login`, { ...data, headers: { ...data.headers, 'X-CSRF-Protection': '1' } });
    const cookie = ok.headers.get('set-cookie'); assert.match(cookie, /Max-Age=2592000/); assert.match(cookie, /Secure/);
  });
});

test('/me recovers CSRF and logout validates CSRF then clears the same cookie', async () => {
  const token = 'a'.repeat(64); let revoked = 0;
  const sessionService = { async me(value) { assert.equal(value, token); return { user, csrfToken: 'c'.repeat(64) }; },
    async logout(value, csrf) { assert.equal(value, token); if (csrf !== 'c'.repeat(64)) throw new PublicError('CSRF_INVALID'); revoked++; } };
  await withApp({ sessionService, cookie: { name: 'skillswap_session', secure: false, rememberMaxAge: 1 } }, async base => {
    const headers = { Cookie: `skillswap_session=${token}`, Origin: 'http://localhost:5173' };
    const me = await fetch(`${base}/api/auth/me`, { headers }); assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), { user, csrfToken: 'c'.repeat(64) });
    assert.equal((await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { ...headers, 'X-CSRF-Token': 'bad' } })).status, 403);
    const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { ...headers,
      'X-CSRF-Token': 'c'.repeat(64) } }); assert.equal(logout.status, 200); assert.equal(revoked, 1);
    assert.match(logout.headers.get('set-cookie'), /^skillswap_session=;/);
    const anonymous = await fetch(`${base}/api/auth/logout`, { method: 'POST' }); assert.equal(anonymous.status, 200);
  });
});
