import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readLoginSecurityConfig } from '../src/config/login-security.js';
import { readSessionSecurityConfig, sessionPolicy } from '../src/config/session-security.js';
import { createSessionProtection, readSessionCookie } from '../src/modules/auth/session-security.js';
import { createSessionService } from '../src/modules/auth/session.service.js';
import { createLoginService, validateLogin } from '../src/modules/auth/login.service.js';

const key = () => randomBytes(32).toString('hex');

test('login/session configuration requires independent keys and keeps proxy trust disabled by default', () => {
  const login = key(), csrf = key(), otp = key(), rate = key();
  assert.equal(readLoginSecurityConfig({ LOGIN_RATE_HMAC_KEY_HEX: login }).trustProxyHops, 0);
  assert.equal(readSessionSecurityConfig({ SESSION_CSRF_KEY_HEX: csrf, LOGIN_RATE_HMAC_KEY_HEX: login }).secureCookie, false);
  assert.equal(readSessionSecurityConfig({ SESSION_CSRF_KEY_HEX: csrf }, 'production').secureCookie, true);
  for (const reused of [login, otp, rate]) assert.throws(() => readSessionSecurityConfig({
    SESSION_CSRF_KEY_HEX: reused, LOGIN_RATE_HMAC_KEY_HEX: reused, OTP_HMAC_KEY_HEX: otp,
    OTP_RATE_HMAC_KEY_HEX: rate,
  }));
  assert.equal(sessionPolicy.regular.idleSeconds, 1800);
  assert.equal(sessionPolicy.regular.absoluteSeconds, 28800);
  assert.equal(sessionPolicy.remembered.idleSeconds, 604800);
  assert.equal(sessionPolicy.remembered.absoluteSeconds, 2592000);
});

test('opaque sessions derive stable bound CSRF without exposing the cookie or key', () => {
  const protection = createSessionProtection(key());
  const issued = protection.issue();
  assert.match(issued.token, /^[0-9a-f]{64}$/);
  assert.match(issued.csrfToken, /^[0-9a-f]{64}$/);
  assert.notEqual(issued.token, issued.csrfToken);
  assert.deepEqual(protection.inspect(issued.token).idHash, issued.idHash);
  assert.equal(protection.verifyCsrf(issued.token, issued.csrfToken, issued.csrfHmac), true);
  assert.equal(protection.verifyCsrf(issued.token, '0'.repeat(64), issued.csrfHmac), false);
  assert.equal(readSessionCookie(`x=1; skillswap_session=${issued.token}`), issued.token);
  assert.equal(readSessionCookie(`skillswap_session=${issued.token}; skillswap_session=${issued.token}`), null);
});

test('login validates exact input and reserves persistent limits before account lookup', async () => {
  assert.deepEqual(validateLogin({ email: ' USER@EXAMPLE.COM ', password: 'secret', remember: false }),
    { email: 'user@example.com', password: 'secret', remember: false });
  for (const body of [{ email: 'a@b', password: 'x' }, { email: 'a@b', password: 'x', remember: 'yes' },
    { email: 'a@b', password: 'x', remember: false, role: 'ADMIN' }]) {
    assert.throws(() => validateLogin(body), error => error.code === 'VALIDATION_ERROR');
  }
  const calls = [];
  const account = { id: 'u', first_name: 'Ada', last_name: 'Lovelace', email: 'user@example.com',
    password_hash: 'encoded', role: 'ADMIN', status: 'ACTIVE', email_verified_at: new Date() };
  const service = createLoginService({
    rateRepository: { async take() { calls.push('rate'); return { allowed: true }; } },
    identifiers: { email() { return Buffer.alloc(32, 1); }, ip() { return Buffer.alloc(32, 2); } },
    sessionRepository: { async findAccount() { calls.push('account'); return account; },
      async create(input) { calls.push('session'); assert.equal(input.remember, false); } },
    protection: { issue() { return { token: 'a'.repeat(64), idHash: Buffer.alloc(32),
      csrfToken: 'b'.repeat(64), csrfHmac: Buffer.alloc(32) }; } },
    verify: async () => { calls.push('password'); return true; },
  });
  const result = await service.login({ email: 'user@example.com', password: 'secret', remember: false }, '127.0.0.1');
  assert.deepEqual(calls, ['rate', 'account', 'password', 'session']);
  assert.equal(result.user.role, 'admin'); assert.equal(result.user.career, null);
});

test('login exposes uniform invalid credentials and rate limiting does no account lookup', async () => {
  let lookups = 0, verifications = 0;
  const build = (take, account = null) => createLoginService({ rateRepository: { take },
    identifiers: { email: () => Buffer.alloc(32), ip: () => Buffer.alloc(32) },
    sessionRepository: { async findAccount() { lookups++; return account; }, async create() {} },
    protection: { issue: () => ({ token: 'a'.repeat(64), idHash: Buffer.alloc(32), csrfToken: 'b'.repeat(64), csrfHmac: Buffer.alloc(32) }) },
    verify: async () => { verifications++; return false; } });
  await assert.rejects(build(async () => ({ allowed: true })).login({ email: 'none@example.com', password: 'x', remember: false }, '127.0.0.1'),
    error => error.code === 'INVALID_CREDENTIALS');
  assert.equal(lookups, 1); assert.equal(verifications, 1);
  await assert.rejects(build(async () => ({ allowed: false, retryAfter: 900 })).login({ email: 'none@example.com', password: 'x', remember: false }, '127.0.0.1'),
    error => error.code === 'RATE_LIMITED' && error.retryAfter === 900);
  assert.equal(lookups, 1);
});

test('session recovery revokes accounts that become ineligible while logout remains available', async () => {
  const protection = createSessionProtection(key()); const issued = protection.issue(); let revoked = 0;
  const repository = { async resolve() { return { csrfHmac: issued.csrfHmac,
    user: { id: 'u', first_name: 'Suspendida', last_name: 'Local', email: 'x@example.com',
      role: 'ADMIN', status: 'SUSPENDED', email_verified_at: new Date() } }; },
  async revoke() { revoked++; return true; } };
  const service = createSessionService(repository, protection);
  await assert.rejects(service.me(issued.token), error => error.code === 'ACCOUNT_SUSPENDED'); assert.equal(revoked, 1);
  assert.equal(await service.logout(issued.token, issued.csrfToken), true); assert.equal(revoked, 2);
});
