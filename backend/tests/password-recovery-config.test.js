import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readPasswordRecoveryConfig } from '../src/config/password-recovery.js';

const key = () => randomBytes(32).toString('hex');

test('recovery configuration requires stable independent keys and fixed approved policy', () => {
  const source = { PASSWORD_RECOVERY_HMAC_KEY_HEX: key(), PASSWORD_RECOVERY_RATE_HMAC_KEY_HEX: key(),
    PASSWORD_RECOVERY_HMAC_KEY_VERSION: 'v1' };
  const config = readPasswordRecoveryConfig(source);
  assert.equal(config.challengeKey.length, 64);
  assert.equal(config.rateKey.length, 64);
  assert.notEqual(config.challengeKey, config.rateKey);
  for (const patch of [{ PASSWORD_RECOVERY_HMAC_KEY_HEX: '' },
    { PASSWORD_RECOVERY_RATE_HMAC_KEY_HEX: source.PASSWORD_RECOVERY_HMAC_KEY_HEX },
    { OTP_HMAC_KEY_HEX: source.PASSWORD_RECOVERY_HMAC_KEY_HEX },
    { PASSWORD_RECOVERY_TTL_SECONDS: '601' }]) {
    assert.throws(() => readPasswordRecoveryConfig({ ...source, ...patch }));
  }
});
