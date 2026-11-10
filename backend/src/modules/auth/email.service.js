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
  if (!policy || Object.values(policy).some(v => !Number.isInteger(v) || v < 1) ||
      Object.keys(policy).length !== 5 || !['ttlSeconds','cooldownSeconds','windowSeconds','maxPerWindow','maxAttempts'].every(k => Object.hasOwn(policy,k)) ||
      policy.ttlSeconds > 3600 || policy.cooldownSeconds < 60 || policy.windowSeconds < policy.cooldownSeconds || policy.windowSeconds > 86400 ||
      policy.maxPerWindow > 20 || policy.maxAttempts > 10) throw new Error('Invalid delivery policy');
}

export function createEmailService({ repository, mailer, protection, policy, onEvent = () => {} }) {
  validateDeliveryPolicy(policy);
  policy = Object.freeze({ ...policy });
  const jobs = [];
  const waiters = [];
  let active = 0;
  let closed = false;
  const signal = (event) => { try { onEvent(event); } catch { /* Diagnostics must not alter delivery semantics. */ } };
  function pump() {
    while (active < 2 && jobs.length) {
      const job = jobs.shift(); active++;
      void deliver(job).finally(() => {
        active--; pump();
        if (!active && !jobs.length) for (const resolve of waiters.splice(0)) resolve();
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
      if (closed || active + jobs.length >= 100) throw new PublicError('SERVICE_UNAVAILABLE');
      try { await repository.health(); } catch { throw new PublicError('SERVICE_UNAVAILABLE'); }
      // Recheck after await so parallel health checks cannot overflow queue capacity.
      if (closed || active + jobs.length >= 100) throw new PublicError('SERVICE_UNAVAILABLE');
      const id = randomUUID();
      jobs.push({ id, email });
      // Scheduling after acceptance prevents eligibility/SMTP latency leaking via response time.
      setImmediate(pump);
      return { status: 'accepted', verificationId: id, message: 'Si corresponde, recibirás un código de verificación.' };
    },
    idle() { return active || jobs.length ? new Promise(resolve => waiters.push(resolve)) : Promise.resolve(); },
    async close() { closed = true; if (active || jobs.length) await new Promise(resolve => waiters.push(resolve)); mailer.close?.(); },
  });
}
