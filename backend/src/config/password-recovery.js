import { passwordRecoveryPolicy } from '../modules/auth/password-recovery.policy.js';

export function readPasswordRecoveryConfig(source) {
  const settings = {
    PASSWORD_RECOVERY_DIGITS: passwordRecoveryPolicy.digits,
    PASSWORD_RECOVERY_TTL_SECONDS: passwordRecoveryPolicy.ttlSeconds,
    PASSWORD_RECOVERY_MAX_ATTEMPTS: passwordRecoveryPolicy.maxAttempts,
    PASSWORD_RECOVERY_COOLDOWN_SECONDS: passwordRecoveryPolicy.cooldownSeconds,
    PASSWORD_RECOVERY_WINDOW_SECONDS: passwordRecoveryPolicy.windowSeconds,
    PASSWORD_RECOVERY_EMAIL_LIMIT: passwordRecoveryPolicy.emailLimit,
    PASSWORD_RECOVERY_IP_LIMIT: passwordRecoveryPolicy.ipLimit,
  };
  for (const [key, value] of Object.entries(settings)) {
    if (source[key] !== undefined && source[key] !== '' && source[key] !== String(value)) {
      throw new Error('Password recovery policy override rejected');
    }
  }
  const challengeKey = source.PASSWORD_RECOVERY_HMAC_KEY_HEX ?? '';
  const rateKey = source.PASSWORD_RECOVERY_RATE_HMAC_KEY_HEX ?? '';
  const keyVersion = source.PASSWORD_RECOVERY_HMAC_KEY_VERSION;
  if (!/^[0-9a-fA-F]{64}$/.test(challengeKey) || !/^[0-9a-fA-F]{64}$/.test(rateKey) ||
      challengeKey.toLowerCase() === rateKey.toLowerCase() ||
      !/^[A-Za-z0-9._-]{1,50}$/.test(keyVersion ?? '')) {
    throw new Error('Distinct private password recovery keys required');
  }
  const otherKeys = ['OTP_HMAC_KEY_HEX', 'OTP_RATE_HMAC_KEY_HEX', 'LOGIN_RATE_HMAC_KEY_HEX',
    'SESSION_CSRF_KEY_HEX'].map(key => source[key]?.toLowerCase()).filter(Boolean);
  if (otherKeys.includes(challengeKey.toLowerCase()) || otherKeys.includes(rateKey.toLowerCase())) {
    throw new Error('Password recovery keys must be independent');
  }
  return Object.freeze({ challengeKey, rateKey, keyVersion, policy: passwordRecoveryPolicy });
}
