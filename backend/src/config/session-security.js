export const sessionPolicy = Object.freeze({
  regular: Object.freeze({ idleSeconds: 30 * 60, absoluteSeconds: 8 * 60 * 60 }),
  remembered: Object.freeze({ idleSeconds: 7 * 24 * 60 * 60, absoluteSeconds: 30 * 24 * 60 * 60 }),
  cookieName: 'skillswap_session',
});

export function readSessionSecurityConfig(source, nodeEnv = 'development') {
  const keyHex = source.SESSION_CSRF_KEY_HEX;
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex ?? '')) throw new Error('Invalid session security configuration');
  for (const other of ['LOGIN_RATE_HMAC_KEY_HEX', 'OTP_HMAC_KEY_HEX', 'OTP_RATE_HMAC_KEY_HEX']) {
    if (typeof source[other] === 'string' && source[other] && source[other].toLowerCase() === keyHex.toLowerCase()) {
      throw new Error('Session CSRF key must be independent');
    }
  }
  return Object.freeze({ csrfKeyHex: keyHex, secureCookie: nodeEnv === 'production', policy: sessionPolicy });
}
