import { createHmac, randomInt } from 'node:crypto';

export function createCodeProtection({ keyHex, keyVersion, digits }) {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex ?? '') || !/^[A-Za-z0-9._-]{1,50}$/.test(keyVersion ?? '') ||
      !Number.isInteger(digits) || digits < 6 || digits > 8) throw new Error('Invalid OTP protection configuration');
  const key = Buffer.from(keyHex, 'hex');
  return Object.freeze({
    keyVersion,
    generate: () => String(randomInt(0, 10 ** digits)).padStart(digits, '0'),
    digest({ id, email, code }) {
      return createHmac('sha256', key).update(JSON.stringify(['skillswap-email-v1', id, email, code])).digest();
    },
  });
}
