import { createHmac } from 'node:crypto';

export function createLoginRateIdentifiers(keyHex) {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex ?? '')) throw new Error('Invalid login rate HMAC configuration');
  const key = Buffer.from(keyHex, 'hex');
  const identify = (scope, value) => createHmac('sha256', key)
    .update(JSON.stringify(['skillswap-login-rate-v1', scope, value])).digest();
  return Object.freeze({
    email(value) {
      if (typeof value !== 'string' || !value || value.length > 254 || value !== value.trim().toLowerCase() ||
          /[\r\n\0]/.test(value)) throw new Error('Invalid normalized email identifier');
      return identify('EMAIL', value);
    },
    ip(value) {
      if (typeof value !== 'string' || !value || value.length > 64 || /[\s\r\n\0]/.test(value)) {
        throw new Error('Invalid trusted IP identifier');
      }
      return identify('IP', value);
    },
  });
}
