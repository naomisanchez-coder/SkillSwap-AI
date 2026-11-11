import { otpPolicy } from './email.policy.js';

import { randomUUID } from 'node:crypto';
import { PublicError } from '../../errors/PublicError.js';

export function validateEmailRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== 1 || !Object.hasOwn(input, 'email')) throw new PublicError('VALIDATION_ERROR', { general: 'Envía únicamente el correo institucional.' });
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[a-z]+\.[a-z]+@tecsup\.edu\.pe$/.test(email)) throw new PublicError('VALIDATION_ERROR', { email: 'Usa el formato nombre.apellido@tecsup.edu.pe, sin alias.' });
  return email;
}

export function validateDeliveryPolicy(policy) {
  if (!policy || Object.keys(policy).length !== 5 || Object.entries(otpPolicy).some(([key,value]) => policy[key] !== value)) throw new Error('Approved OTP policy required');
}

export function createEmailService({ repository, rateRepository, rateIdentifier, mailer, protection, policy = otpPolicy, onEvent = () => {} }) {
  validateDeliveryPolicy(policy);
  if (typeof rateRepository?.take !== 'function' || typeof rateIdentifier !== 'function') throw new Error('Persistent rate limiter required');
  policy = Object.freeze({ ...policy });
  const jobs = [];
  const waiters = [];
  let active = 0;
  let admissions = 0;
  let closed = false;
  const signal = (event) => { try { onEvent(event); } catch { /* Diagnostics must not alter delivery semantics. */ } };
  function pump() {
    while (active < 2 && jobs.length) {
      const job = jobs.shift(); active++;
      void deliver(job).finally(() => {
        active--; pump();
        if (!admissions && !active && !jobs.length) for (const resolve of waiters.splice(0)) resolve();
      });
    }
  }
  async function deliver({ id, email }) {
    let reserved = false;
    try {
      const code = protection.generate();
      const digest = protection.digest({ id, email, code });
      const message = await repository.reserve({ id, email, digest, keyVersion: protection.keyVersion, policy });
      if (!message) return;
      reserved = true;
      // Transaction committed and connection released before any network call.
      if (message.expiresAt.getTime() <= Date.now()) throw new Error('Expired before delivery');
      await mailer.sendVerification({ ...message, code });
      if (!await repository.confirmDelivery(id)) {
        await repository.revoke(id); signal('activation_rejected'); return;
      }
      signal('smtp_accepted'); // Not proof of mailbox reception.
    } catch {
      signal(reserved ? 'delivery_failed' : 'persistence_failed');
      if (reserved) {
        try { await repository.revoke(id); } catch { signal('revocation_failed'); }
      }
    }
  }
  return Object.freeze({
    limits: Object.freeze({ cooldownSeconds: policy.cooldownSeconds, windowSeconds: policy.windowSeconds, maxPerWindow: policy.maxPerWindow }),
    async request(input) {
      const email = validateEmailRequest(input);
      if (closed || active + jobs.length + admissions >= 100) throw new PublicError('SERVICE_UNAVAILABLE');
      admissions++;
      try {
        await repository.health();
        const admission = await rateRepository.take(rateIdentifier(email));
        if (!admission.allowed) {
          const error = new PublicError('RATE_LIMITED');
          error.retryAfter = admission.retryAfter;
          throw error;
        }
        if (closed) throw new PublicError('SERVICE_UNAVAILABLE');
        const id = randomUUID();
        jobs.push({ id, email });
        setImmediate(pump);
        return { status: 'accepted', verificationId: id, message: 'Si corresponde, recibirás un código de verificación.' };
      } catch (error) {
        if (error instanceof PublicError) throw error;
        throw new PublicError('SERVICE_UNAVAILABLE');
      } finally { admissions--; if (!admissions && !active && !jobs.length) for (const resolve of waiters.splice(0)) resolve(); }
    },
    idle() { return admissions || active || jobs.length ? new Promise(resolve => waiters.push(resolve)) : Promise.resolve(); },
    async close() { closed = true; if (admissions || active || jobs.length) await new Promise(resolve => waiters.push(resolve)); mailer.close?.(); },
  });
}
