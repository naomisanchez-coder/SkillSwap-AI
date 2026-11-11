import { randomUUID } from 'node:crypto';
import { PublicError } from '../../errors/PublicError.js';
import { hashPassword } from './password.service.js';
import { validatePasswordReset, validateRecoveryRequest } from './password-recovery.js';

export function createPasswordRecoveryService({ repository, rateRepository, identifiers, protection, mailer,
  policy, hash = hashPassword, onEvent = () => {} }) {
  if (!repository || typeof rateRepository?.take !== 'function' || !identifiers || !protection || !mailer ||
      policy?.digits !== 6 || policy?.ttlSeconds !== 600 || policy?.maxAttempts !== 5) {
    throw new Error('Complete password recovery dependencies required');
  }
  const jobs = [];
  const waiters = [];
  let active = 0;
  let admissions = 0;
  let closed = false;
  const signal = event => { try { onEvent(event); } catch { /* Diagnostics never alter recovery. */ } };
  const settle = () => {
    if (!admissions && !active && !jobs.length) for (const resolve of waiters.splice(0)) resolve();
  };
  async function deliver({ id, email }) {
    let reserved = false;
    try {
      const code = protection.generate();
      const digest = protection.digest({ id, email, code });
      const message = await repository.reserve({ id, email, digest,
        keyVersion: protection.keyVersion, policy });
      if (!message) return;
      reserved = true;
      if (message.expiresAt.getTime() <= Date.now()) throw new Error('Expired before recovery delivery');
      await mailer.sendPasswordRecovery({ ...message, code });
      if (!await repository.confirmDelivery(id)) {
        await repository.revoke(id);
        signal('activation_rejected');
        return;
      }
      signal('smtp_accepted');
    } catch {
      signal(reserved ? 'delivery_failed' : 'persistence_failed');
      if (reserved) {
        try { await repository.revoke(id); } catch { signal('revocation_failed'); }
      }
    }
  }
  function pump() {
    while (active < 2 && jobs.length) {
      const job = jobs.shift();
      active++;
      void deliver(job).finally(() => { active--; pump(); settle(); });
    }
  }
  return Object.freeze({
    async request(body, ip) {
      const { email } = validateRecoveryRequest(body);
      if (closed || active + jobs.length + admissions >= 100) throw new PublicError('SERVICE_UNAVAILABLE');
      admissions++;
      try {
        await repository.health();
        const admission = await rateRepository.take({ emailHmac: identifiers.email(email),
          ipHmac: identifiers.ip(ip) });
        if (!admission.allowed) {
          const error = new PublicError('RATE_LIMITED');
          Object.defineProperty(error, 'retryAfter', { value: admission.retryAfter });
          throw error;
        }
        if (typeof rateRepository.cleanupExpired === 'function') {
          void rateRepository.cleanupExpired().catch(() => signal('rate_cleanup_failed'));
        }
        if (closed) throw new PublicError('SERVICE_UNAVAILABLE');
        const recoveryId = randomUUID();
        jobs.push({ id: recoveryId, email });
        setImmediate(pump);
        return { status: 'accepted', recoveryId,
          message: 'Si corresponde, recibirás instrucciones para recuperar tu cuenta.' };
      } catch (error) {
        if (error instanceof PublicError) throw error;
        throw new PublicError('SERVICE_UNAVAILABLE');
      } finally { admissions--; settle(); }
    },
    async reset(body) {
      const input = validatePasswordReset(body);
      const passwordHash = await hash(input.newPassword);
      const digest = protection.digest({ id: input.recoveryId, email: input.email, code: input.code });
      let result;
      try {
        result = await repository.reset({ id: input.recoveryId, email: input.email, digest,
          passwordHash, maxAttempts: policy.maxAttempts });
      } catch { throw new PublicError('SERVICE_UNAVAILABLE'); }
      if (!result.changed) throw new PublicError('RECOVERY_INVALID');
      try {
        await mailer.sendPasswordChanged({ to: result.to });
        signal('password_change_notified');
      } catch { signal('password_change_notification_failed'); }
      return { status: 'password_updated', nextAction: 'login' };
    },
    idle() { return admissions || active || jobs.length ? new Promise(resolve => waiters.push(resolve)) : Promise.resolve(); },
    async close() {
      closed = true;
      if (admissions || active || jobs.length) await new Promise(resolve => waiters.push(resolve));
      mailer.close?.();
    },
  });
}
