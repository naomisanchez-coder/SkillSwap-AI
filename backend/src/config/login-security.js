export const loginRatePolicy = Object.freeze({ windowSeconds: 900, emailLimit: 5,
  ipLimit: 20, retentionSeconds: 86400, cleanupBatch: 100 });

export function readLoginSecurityConfig(source) {
  const keyHex = source.LOGIN_RATE_HMAC_KEY_HEX;
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex ?? '')) throw new Error('Invalid login security configuration');
  for (const other of ['OTP_HMAC_KEY_HEX', 'OTP_RATE_HMAC_KEY_HEX', 'SESSION_CSRF_KEY_HEX']) {
    if (typeof source[other] === 'string' && source[other] && source[other].toLowerCase() === keyHex.toLowerCase()) {
      throw new Error('Login rate key must be independent');
    }
  }
  const hops = source.TRUST_PROXY_HOPS ?? '0';
  if (!/^\d+$/.test(hops) || Number(hops) < 0 || Number(hops) > 10) throw new Error('Invalid proxy configuration');
  return Object.freeze({ rateKeyHex: keyHex, trustProxyHops: Number(hops), policy: loginRatePolicy });
}
