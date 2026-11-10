import { validateRegistration } from './auth.validation.js';
import { hashPassword } from './password.service.js';
import { registrationPolicy } from './registration.policy.js';

export function createAuthService(repository, { hash = hashPassword, now = () => new Date(), policy = registrationPolicy } = {}) {
  return Object.freeze({
    async register(body) {
      const { password, ...input } = validateRegistration(body, policy);
      // Expensive work happens before acquiring/locking a transactional connection.
      const passwordHash = await hash(password);
      const user = await repository.createStudent({ ...input, passwordHash, termsAcceptedAt: now() });
      // Explicit DTO: never serialize a row, hash, password or internal IDs.
      return { user: { email: user.email, role: 'student', emailVerified: false, onboardingComplete: false } };
    },
  });
}
