import { otpPolicy, otpDigits } from '../modules/auth/email.policy.js';

// No dotenv side effects here: the server supplies its existing private environment.
export function readEmailConfig(source) {
  if (source.SMTP_ENABLED === undefined || source.SMTP_ENABLED === '' || source.SMTP_ENABLED === 'false') return null;
  if (source.SMTP_ENABLED !== 'true') throw new Error('Invalid email configuration');
  const required = (key) => {
    const value = source[key];
    if (typeof value !== 'string' || !value.trim() || /[\r\n\0]/.test(value)) throw new Error('Invalid email configuration');
    return value;
  };
  const host = required('SMTP_HOST');
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || host.length > 253) throw new Error('Invalid email configuration');
  const port = required('SMTP_PORT');
  if (!['465', '587'].includes(port)) throw new Error('Invalid email configuration');
  const from = required('SMTP_FROM');
  if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(from) || from.length > 254) throw new Error('Invalid email configuration');
  return Object.freeze({ host, port: Number(port), user: required('SMTP_USER'), password: required('SMTP_PASSWORD'), from });
}

export function readOtpConfig(source) {
  const settings = { OTP_DIGITS: otpDigits, OTP_TTL_SECONDS: otpPolicy.ttlSeconds,
    OTP_COOLDOWN_SECONDS: otpPolicy.cooldownSeconds, OTP_WINDOW_SECONDS: otpPolicy.windowSeconds,
    OTP_MAX_PER_WINDOW: otpPolicy.maxPerWindow, OTP_MAX_ATTEMPTS: otpPolicy.maxAttempts };
  for (const [key, value] of Object.entries(settings)) if (source[key] !== undefined && source[key] !== '' && source[key] !== String(value)) throw new Error('OTP policy override rejected');
  if (!/^[0-9a-fA-F]{64}$/.test(source.OTP_HMAC_KEY_HEX ?? '') ||
      !/^[0-9a-fA-F]{64}$/.test(source.OTP_RATE_HMAC_KEY_HEX ?? '') ||
      source.OTP_HMAC_KEY_HEX.toLowerCase() === source.OTP_RATE_HMAC_KEY_HEX.toLowerCase()) throw new Error('Distinct private OTP keys required');
  return { protection: { keyHex: source.OTP_HMAC_KEY_HEX, keyVersion: source.OTP_HMAC_KEY_VERSION, digits: otpDigits },
    rateKeyHex: source.OTP_RATE_HMAC_KEY_HEX, policy: otpPolicy };
}
