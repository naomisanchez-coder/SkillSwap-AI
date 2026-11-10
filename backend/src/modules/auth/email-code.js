import { otpDigits } from './email.policy.js';
import { createHmac, randomInt } from 'node:crypto';

export function createCodeProtection({ keyHex, keyVersion, digits = otpDigits }) {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex ?? '') || !/^[A-Za-z0-9._-]{1,50}$/.test(keyVersion ?? '') ||
      digits !== otpDigits) throw new Error('Invalid OTP protection configuration');
  const key = Buffer.from(keyHex, 'hex');
  return Object.freeze({
    keyVersion,
    generate: () => String(randomInt(0, 10 ** digits)).padStart(digits, '0'),
    digest({ id, email, code }) {
      return createHmac('sha256', key).update(JSON.stringify(['skillswap-email-v1', id, email, code])).digest();
    },
  });
}

// Separate, stable key: rotating the challenge key must not reset rate history.
export function createRateIdentifier(keyHex) {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex ?? '')) throw new Error('Invalid rate HMAC configuration');
  const key = Buffer.from(keyHex, 'hex');
  return email => createHmac('sha256', key).update(JSON.stringify(['skillswap-otp-rate-v1', email])).digest();
}
