import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createCodeProtection } from '../src/modules/auth/email-code.js';
import { passwordRecoveryPolicy, passwordRecoveryStates } from '../src/modules/auth/password-recovery.policy.js';
import { createPasswordRecoveryProtection, createPasswordRecoveryRateIdentifiers,
  decideRecoveryAttempt, validatePasswordReset, validateRecoveryRequest } from '../src/modules/auth/password-recovery.js';

const key = () => randomBytes(32).toString('hex');

test('proposed recovery policy is bounded and states keep SENDING non-verifiable', () => {
  assert.deepEqual(passwordRecoveryPolicy, { digits: 6, ttlSeconds: 600, maxAttempts: 5,
    cooldownSeconds: 60, windowSeconds: 3600, emailLimit: 5, ipLimit: 20,
    retentionSeconds: 86400, cleanupBatch: 100 });
  assert.equal(passwordRecoveryStates.verifiable, 'PENDING');
  assert.deepEqual(passwordRecoveryStates.nonVerifiable,
    ['SENDING', 'CONSUMED', 'REVOKED', 'EXPIRED', 'EXHAUSTED']);
});

test('request accepts normalized student or administrator email without exposing eligibility', () => {
  assert.deepEqual(validateRecoveryRequest({ email: ' USER@EXAMPLE.COM ' }), { email: 'user@example.com' });
  assert.deepEqual(validateRecoveryRequest({ email: 'nombre.apellido@tecsup.edu.pe' }),
    { email: 'nombre.apellido@tecsup.edu.pe' });
  for (const input of [{}, { email: 'bad' }, { email: 'a@b', role: 'ADMIN' }]) {
    assert.throws(() => validateRecoveryRequest(input), error => error.code === 'VALIDATION_ERROR');
  }
});

test('reset requires exact UUID, six digits and current password policy without normalizing password', () => {
  const body = { email: ' USER@EXAMPLE.COM ', recoveryId: randomUUID(), code: '001234', newPassword: ' NuevaClave2026! ' };
  const result = validatePasswordReset(body); assert.equal(result.email, 'user@example.com');
  assert.equal(result.code, '001234'); assert.equal(result.newPassword, body.newPassword);
  for (const patch of [{ code: '12345' }, { code: 123456 }, { recoveryId: 'not-an-id' },
    { newPassword: 'short' }, { role: 'ADMIN' }]) {
    assert.throws(() => validatePasswordReset({ ...body, ...patch }), error => error.code === 'VALIDATION_ERROR');
  }
});

test('recovery OTP is six-digit, protected and domain-separated from email verification', () => {
  const shared = key(), id = randomUUID(), email = 'user@example.com';
  const recovery = createPasswordRecoveryProtection({ keyHex: shared, keyVersion: 'v1', random: () => 42 });
  const code = recovery.generate(); assert.equal(code, '000042');
  const digest = recovery.digest({ id, email, code }); assert.equal(digest.length, 32);
  assert.equal(digest.includes(Buffer.from(code)), false);
  const verification = createCodeProtection({ keyHex: shared, keyVersion: 'v1', digits: 6 });
  assert.notDeepEqual(digest, verification.digest({ id, email, code }));
});

test('EMAIL/IP rate identifiers are pseudonymous, stable and separated', () => {
  const identify = createPasswordRecoveryRateIdentifiers(key());
  const email = identify.email('user@example.com'), same = identify.email('user@example.com');
  const ip = identify.ip('127.0.0.1'); assert.deepEqual(email, same); assert.notDeepEqual(email, ip);
  assert.equal(email.length, 32); assert.equal(email.includes(Buffer.from('user@example.com')), false);
});

test('challenge decisions reject SENDING/terminal/expired and exhaust exactly five attempts', () => {
  const now = new Date('2026-01-01T00:00:00Z'), future = new Date(now.getTime() + 600000);
  for (const status of passwordRecoveryStates.nonVerifiable) assert.equal(decideRecoveryAttempt({
    status, attempts: status === 'EXHAUSTED' ? 5 : 0, maxAttempts: 5, expiresAt: future, now, matches: true }).accepted, false);
  assert.deepEqual(decideRecoveryAttempt({ status: 'PENDING', attempts: 0, maxAttempts: 5,
    expiresAt: now, now, matches: true }), { accepted: false, status: 'EXPIRED', attempts: 0 });
  assert.deepEqual(decideRecoveryAttempt({ status: 'PENDING', attempts: 4, maxAttempts: 5,
    expiresAt: future, now, matches: false }), { accepted: false, status: 'EXHAUSTED', attempts: 5 });
  assert.deepEqual(decideRecoveryAttempt({ status: 'PENDING', attempts: 1, maxAttempts: 5,
    expiresAt: future, now, matches: true }), { accepted: true, status: 'CONSUMED', attempts: 1 });
});
