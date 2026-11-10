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
  const integer = (key) => {
    if (typeof source[key] !== 'string' || !/^\d+$/.test(source[key])) throw new Error('OTP policy configuration required');
    const value = Number(source[key]);
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid OTP policy configuration');
    return value;
  };
  return {
    protection: { keyHex: source.OTP_HMAC_KEY_HEX, keyVersion: source.OTP_HMAC_KEY_VERSION, digits: integer('OTP_DIGITS') },
    policy: { ttlSeconds: integer('OTP_TTL_SECONDS'), cooldownSeconds: integer('OTP_COOLDOWN_SECONDS'),
      windowSeconds: integer('OTP_WINDOW_SECONDS'), maxPerWindow: integer('OTP_MAX_PER_WINDOW'), maxAttempts: integer('OTP_MAX_ATTEMPTS') },
  };
}
