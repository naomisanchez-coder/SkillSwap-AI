import { randomUUID } from 'node:crypto';
import { PublicError } from '../../errors/PublicError.js';

export function createAuthRepository(database) {
  return Object.freeze({
    async createStudent(input) {
      try {
        return await database.transaction(async (tx) => {
          // Lock catalogue rows against deactivation/removal during registration.
          // More than one matching name is ambiguous; do not pick an arbitrary career.
          const [careers] = await tx.execute(
            'SELECT id, is_active FROM careers WHERE name = ? ORDER BY id LIMIT 2 FOR SHARE', [input.career]);
          if (careers.length !== 1 || careers[0].is_active !== 1) {
            throw new PublicError('VALIDATION_ERROR', { career: 'Selecciona una carrera autorizada y activa.' });
          }
          const careerId = careers[0].id;
          const [cycles] = await tx.execute(
            'SELECT cycle FROM career_cycles WHERE career_id = ? AND cycle = ? FOR SHARE', [careerId, input.cycle]);
          if (cycles.length !== 1) {
            throw new PublicError('VALIDATION_ERROR', { cycle: 'Selecciona un ciclo autorizado para la carrera.' });
          }
          const id = randomUUID();
          await tx.execute(
            `INSERT INTO users (id, first_name, last_name, email, password_hash, role, status,
              terms_accepted_at, terms_version, privacy_version)
             VALUES (?, ?, ?, ?, ?, 'STUDENT', 'PENDING_VERIFICATION', ?, ?, ?)`,
            [id, input.firstName, input.lastName, input.email, input.passwordHash,
              input.termsAcceptedAt, input.termsVersion, input.privacyVersion]);
          await tx.execute(
            'INSERT INTO student_profiles (user_id, career_id, cycle, onboarding_complete) VALUES (?, ?, ?, FALSE)',
            [id, careerId, input.cycle]);
          return { id, email: input.email };
        });
      } catch (error) {
        // Only classify a uniqueness violation as an email duplicate after confirming
        // that address exists. Do not parse or expose MySQL error messages/bindings.
        if (error?.code === 'ER_DUP_ENTRY') {
          const [existing] = await database.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [input.email]);
          if (existing.length) throw new PublicError('EMAIL_ALREADY_REGISTERED');
        }
        throw error;
      }
    },
  });
}
