import { createHmac, randomInt } from 'node:crypto';
import { PublicError } from '../../errors/PublicError.js';
import { registrationPolicy } from './registration.policy.js';
import { passwordRecoveryPolicy } from './password-recovery.policy.js';

const plainObject = value => value && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const normalizedEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = value => value.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(value) && !/[\r\n\0]/.test(value);

export function validateRecoveryRequest(input) {
  if (!plainObject(input) || Object.keys(input).length !== 1 || !Object.hasOwn(input, 'email')) {
    throw new PublicError('VALIDATION_ERROR', { general: 'Envía únicamente el correo de la cuenta.' });
  }
  const email = normalizedEmail(input.email);
  if (!validEmail(email)) throw new PublicError('VALIDATION_ERROR', { email: 'Ingresa un correo válido.' });
  return { email };
}

export function validatePasswordReset(input, policy = registrationPolicy) {
  const fields = new Set(['email', 'recoveryId', 'code', 'newPassword']);
  if (!plainObject(input) || Object.keys(input).some(key => !fields.has(key)) || Object.keys(input).length !== 4) {
    throw new PublicError('VALIDATION_ERROR', { general: 'Envía únicamente los campos permitidos.' });
  }
  const email = normalizedEmail(input.email); const errors = {};
  if (!validEmail(email)) errors.email = 'Ingresa un correo válido.';
  if (typeof input.recoveryId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.recoveryId)) {
    errors.recoveryId = 'El desafío de recuperación no es válido.';
  }
  if (typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) errors.code = 'Ingresa el código de seis dígitos.';
  const password = input.newPassword;
  if (typeof password !== 'string' || !password.isWellFormed() || [...password].length < policy.minLength ||
      [...password].length > policy.maxLength || Buffer.byteLength(password, 'utf8') > 512) {
    errors.newPassword = 'La contraseña no cumple la longitud permitida.';
  }
  if (Object.keys(errors).length) throw new PublicError('VALIDATION_ERROR', errors);
  return { email, recoveryId: input.recoveryId.toLowerCase(), code: input.code, newPassword: password };
}

export function createPasswordRecoveryProtection({ keyHex, keyVersion, random = randomInt }) {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex ?? '') || !/^[A-Za-z0-9._-]{1,50}$/.test(keyVersion ?? '')) {
    throw new Error('Invalid password recovery protection configuration');
  }
  const key = Buffer.from(keyHex, 'hex');
  const digest = ({ id, email, code }) => createHmac('sha256', key)
    .update(JSON.stringify(['skillswap-password-recovery-v1', id, email, code])).digest();
  return Object.freeze({ keyVersion, generate: () => String(random(0, 10 ** passwordRecoveryPolicy.digits))
    .padStart(passwordRecoveryPolicy.digits, '0'), digest });
}

export function createPasswordRecoveryRateIdentifiers(keyHex) {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex ?? '')) throw new Error('Invalid password recovery rate configuration');
  const key = Buffer.from(keyHex, 'hex');
  const identify = (scope, value) => createHmac('sha256', key)
    .update(JSON.stringify(['skillswap-password-recovery-rate-v1', scope, value])).digest();
  return Object.freeze({
    email(value) { if (!validEmail(value) || value !== normalizedEmail(value)) throw new Error('Invalid normalized recovery email'); return identify('EMAIL', value); },
    ip(value) { if (typeof value !== 'string' || !value || value.length > 64 || /[\s\r\n\0]/.test(value)) throw new Error('Invalid recovery IP'); return identify('IP', value); },
  });
}

export function decideRecoveryAttempt({ status, attempts, maxAttempts, expiresAt, now, matches }) {
  if (!(expiresAt instanceof Date) || !(now instanceof Date) || ![expiresAt, now].every(date => Number.isFinite(date.getTime())) ||
      !Number.isInteger(attempts) || !Number.isInteger(maxAttempts) || maxAttempts !== passwordRecoveryPolicy.maxAttempts ||
      attempts < 0 || attempts > maxAttempts || typeof matches !== 'boolean') throw new Error('Invalid recovery challenge state');
  if (status !== 'PENDING') return { accepted: false, status, attempts };
  if (expiresAt <= now) return { accepted: false, status: 'EXPIRED', attempts };
  if (attempts >= maxAttempts) return { accepted: false, status: 'EXHAUSTED', attempts };
  if (matches) return { accepted: true, status: 'CONSUMED', attempts };
  const next = attempts + 1;
  return { accepted: false, status: next === maxAttempts ? 'EXHAUSTED' : 'PENDING', attempts: next };
}
