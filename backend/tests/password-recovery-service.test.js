import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPasswordRecoveryService } from '../src/modules/auth/password-recovery.service.js';
import { createPasswordRecoveryProtection, createPasswordRecoveryRateIdentifiers } from '../src/modules/auth/password-recovery.js';
import { passwordRecoveryPolicy } from '../src/modules/auth/password-recovery.policy.js';

const key = () => randomBytes(32).toString('hex');

function fixture({ eligible = true, failDelivery = false, resetChanged = true, failNotification = false } = {}) {
  const calls = { reserve: [], confirm: [], revoke: [], recoveryMail: [], notification: [], reset: [] };
  const protection = createPasswordRecoveryProtection({ keyHex: key(), keyVersion: 'test-v1', random: () => 42 });
  const identifiers = createPasswordRecoveryRateIdentifiers(key());
  const repository = {
    async health() {},
    async reserve(input) {
      calls.reserve.push(input);
      return eligible ? { to: input.email, expiresAt: new Date(Date.now() + 600000) } : null;
    },
    async confirmDelivery(id) { calls.confirm.push(id); return true; },
    async revoke(id) { calls.revoke.push(id); },
    async reset(input) { calls.reset.push(input); return resetChanged ? { changed: true, to: input.email } : { changed: false }; },
  };
  const mailer = {
    async sendPasswordRecovery(message) {
      calls.recoveryMail.push(message);
      if (failDelivery) throw new Error('private provider detail');
    },
    async sendPasswordChanged(message) {
      calls.notification.push(message);
      if (failNotification) throw new Error('private provider detail');
    },
  };
  const service = createPasswordRecoveryService({ repository,
    rateRepository: { async take() { return { allowed: true }; } }, identifiers, protection, mailer,
    policy: passwordRecoveryPolicy, hash: async () => '$scrypt$test-hash' });
  return { service, calls };
}

test('request is publicly uniform and only eligible accounts cause substituted SMTP delivery', async () => {
  const known = fixture(), missing = fixture({ eligible: false });
  const body = { email: 'user@example.com' };
  const knownResult = await known.service.request(body, '127.0.0.1');
  const missingResult = await missing.service.request(body, '127.0.0.1');
  for (const result of [knownResult, missingResult]) {
    assert.equal(result.status, 'accepted');
    assert.match(result.recoveryId, /^[0-9a-f-]{36}$/);
    assert.equal(Object.hasOwn(result, 'code'), false);
  }
  await Promise.all([known.service.idle(), missing.service.idle()]);
  assert.equal(known.calls.recoveryMail.length, 1);
  assert.equal(known.calls.recoveryMail[0].code, '000042');
  assert.equal(known.calls.confirm.length, 1);
  assert.equal(missing.calls.recoveryMail.length, 0);
  await Promise.all([known.service.close(), missing.service.close()]);
});

test('SMTP failure revokes SENDING challenge and never confirms it', async () => {
  const { service, calls } = fixture({ failDelivery: true });
  const result = await service.request({ email: 'user@example.com' }, '127.0.0.1');
  await service.idle();
  assert.deepEqual(calls.revoke, [result.recoveryId]);
  assert.equal(calls.confirm.length, 0);
  await service.close();
});

test('reset hashes before repository transaction and notification failure never reverses success', async () => {
  const { service, calls } = fixture({ failNotification: true });
  const recoveryId = randomUUID();
  const result = await service.reset({ email: 'user@example.com', recoveryId, code: '123456',
    newPassword: 'NuevaClave2026!' });
  assert.deepEqual(result, { status: 'password_updated', nextAction: 'login' });
  assert.equal(calls.reset.length, 1);
  assert.equal(calls.reset[0].passwordHash, '$scrypt$test-hash');
  assert.equal(calls.reset[0].digest.length, 32);
  assert.deepEqual(calls.notification, [{ to: 'user@example.com' }]);
  await service.close();
});

test('invalid, consumed or unknown challenge exposes only RECOVERY_INVALID', async () => {
  const { service } = fixture({ resetChanged: false });
  await assert.rejects(service.reset({ email: 'user@example.com', recoveryId: randomUUID(), code: '123456',
    newPassword: 'NuevaClave2026!' }), error => error.code === 'RECOVERY_INVALID' && error.status === 422);
  await service.close();
});
