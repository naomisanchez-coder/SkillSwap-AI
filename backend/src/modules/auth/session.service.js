import { PublicError } from '../../errors/PublicError.js';

export function publicUser(row) {
  const admin = row.role === 'ADMIN';
  return {
    id: row.id, firstName: row.first_name, lastName: row.last_name,
    name: `${row.first_name} ${row.last_name}`.trim(), email: row.email,
    institution: admin ? null : 'TECSUP', career: admin ? null : row.career,
    cycle: admin ? null : Number(row.cycle), role: admin ? 'admin' : 'student',
    emailVerified: Boolean(row.email_verified_at),
    onboardingComplete: admin ? null : Boolean(row.onboarding_complete),
  };
}

function ensureEligible(user) {
  if (!user.email_verified_at) throw new PublicError('EMAIL_NOT_VERIFIED');
  if (user.status !== 'ACTIVE') throw new PublicError('ACCOUNT_SUSPENDED');
  if (!['STUDENT', 'ADMIN'].includes(user.role)) throw new PublicError('ACCOUNT_SUSPENDED');
  if (user.role === 'STUDENT' && (!user.career || !Number.isInteger(Number(user.cycle)))) {
    throw new PublicError('SERVICE_UNAVAILABLE');
  }
}

export function createSessionService(repository, protection) {
  return Object.freeze({
    async authenticate(token) {
      const inspected = protection.inspect(token);
      if (!inspected) throw new PublicError('SESSION_REQUIRED');
      const session = await repository.resolve(inspected.idHash);
      if (!session) throw new PublicError('SESSION_REQUIRED');
      try { ensureEligible(session.user); }
      catch (error) { await repository.revoke(inspected.idHash); throw error; }
      return { session, inspected, user: publicUser(session.user) };
    },
    async me(token) {
      const result = await this.authenticate(token);
      return { user: result.user, csrfToken: result.inspected.csrfToken };
    },
    async logout(token, csrfToken) {
      const inspected = protection.inspect(token);
      if (!inspected) return false;
      const session = await repository.resolve(inspected.idHash, { touch: false });
      if (!session) return false;
      if (!protection.verifyCsrf(token, csrfToken, session.csrfHmac)) throw new PublicError('CSRF_INVALID');
      await repository.revoke(inspected.idHash);
      return true;
    },
  });
}
