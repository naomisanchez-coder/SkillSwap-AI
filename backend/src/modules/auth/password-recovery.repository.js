import { timingSafeEqual } from 'node:crypto';
import { passwordRecoverySchemaVersion } from './password-recovery.policy.js';

function eligible(user) {
  return Boolean(user && user.status === 'ACTIVE' && user.email_verified_at &&
    ['STUDENT', 'ADMIN'].includes(user.role));
}

function protectedMatch(actual, expected) {
  return Buffer.isBuffer(actual) && Buffer.isBuffer(expected) && actual.length === 32 &&
    expected.length === 32 && timingSafeEqual(actual, expected);
}

export function createPasswordRecoveryRepository(database) {
  return Object.freeze({
    async health() {
      await database.check();
      const [rows] = await database.execute('SELECT version FROM schema_migrations WHERE version = ?',
        [passwordRecoverySchemaVersion]);
      if (rows.length !== 1) throw new Error('Password recovery schema not ready');
    },
    async reserve({ id, email, digest, keyVersion, policy }) {
      return database.transaction(async tx => {
        const [users] = await tx.execute(
          'SELECT id,email,role,status,email_verified_at FROM users WHERE email=? FOR UPDATE', [email]);
        const user = users.length === 1 ? users[0] : null;
        if (!eligible(user)) return null;
        const [[clock]] = await tx.execute('SELECT UTC_TIMESTAMP(6) AS now');
        await tx.execute(`UPDATE password_recovery_challenges
          SET status=CASE WHEN expires_at<=? THEN 'EXPIRED' ELSE 'REVOKED' END
          WHERE user_id=? AND status IN ('SENDING','PENDING')`, [clock.now, user.id]);
        const expiresAt = new Date(clock.now.getTime() + policy.ttlSeconds * 1000);
        await tx.execute(`INSERT INTO password_recovery_challenges
          (id,user_id,code_hmac,hmac_key_version,status,attempts,max_attempts,expires_at,created_at)
          VALUES (?,?,?,?,'SENDING',0,?,?,?)`,
        [id, user.id, digest, keyVersion, policy.maxAttempts, expiresAt, clock.now]);
        return { to: user.email, expiresAt };
      });
    },
    async confirmDelivery(id) {
      return database.transaction(async tx => {
        const [owners] = await tx.execute('SELECT user_id FROM password_recovery_challenges WHERE id=?', [id]);
        if (owners.length !== 1) return false;
        const [users] = await tx.execute(
          'SELECT id,role,status,email_verified_at FROM users WHERE id=? FOR UPDATE', [owners[0].user_id]);
        if (!eligible(users.length === 1 ? users[0] : null)) return false;
        const [result] = await tx.execute(`UPDATE password_recovery_challenges SET status='PENDING'
          WHERE id=? AND user_id=? AND status='SENDING' AND expires_at>UTC_TIMESTAMP(6)`,
        [id, owners[0].user_id]);
        return result.affectedRows === 1;
      });
    },
    async revoke(id) {
      await database.execute(`UPDATE password_recovery_challenges SET status='REVOKED'
        WHERE id=? AND status IN ('SENDING','PENDING')`, [id]);
    },
    async reset({ id, email, digest, passwordHash, maxAttempts }) {
      return database.transaction(async tx => {
        const [[clock]] = await tx.execute('SELECT UTC_TIMESTAMP(6) AS now');
        const [users] = await tx.execute(
          'SELECT id,email,role,status,email_verified_at FROM users WHERE email=? FOR UPDATE', [email]);
        const user = users.length === 1 ? users[0] : null;
        if (!eligible(user)) return { changed: false };
        const [challenges] = await tx.execute(`SELECT id,code_hmac,status,attempts,max_attempts,expires_at
          FROM password_recovery_challenges WHERE id=? AND user_id=? FOR UPDATE`, [id, user.id]);
        if (challenges.length !== 1) return { changed: false };
        const challenge = challenges[0];
        if (challenge.status !== 'PENDING') return { changed: false };
        if (challenge.expires_at <= clock.now) {
          await tx.execute("UPDATE password_recovery_challenges SET status='EXPIRED' WHERE id=?", [id]);
          return { changed: false };
        }
        if (Number(challenge.max_attempts) !== maxAttempts || Number(challenge.attempts) >= maxAttempts) {
          await tx.execute("UPDATE password_recovery_challenges SET status='EXHAUSTED' WHERE id=?", [id]);
          return { changed: false };
        }
        if (!protectedMatch(challenge.code_hmac, digest)) {
          const attempts = Number(challenge.attempts) + 1;
          await tx.execute(`UPDATE password_recovery_challenges SET attempts=?,
            status=CASE WHEN ?=max_attempts THEN 'EXHAUSTED' ELSE 'PENDING' END WHERE id=?`,
          [attempts, attempts, id]);
          return { changed: false };
        }
        const [consumed] = await tx.execute(`UPDATE password_recovery_challenges
          SET status='CONSUMED',consumed_at=? WHERE id=? AND status='PENDING'`, [clock.now, id]);
        if (consumed.affectedRows !== 1) throw new Error('Recovery challenge consumption failed');
        const [updated] = await tx.execute('UPDATE users SET password_hash=?,updated_at=? WHERE id=?',
          [passwordHash, clock.now, user.id]);
        if (updated.affectedRows !== 1) throw new Error('Recovery password update failed');
        await tx.execute(`UPDATE password_recovery_challenges SET status='REVOKED'
          WHERE user_id=? AND id<>? AND status IN ('SENDING','PENDING')`, [user.id, id]);
        await tx.execute('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL',
          [clock.now, user.id]);
        return { changed: true, to: user.email };
      });
    },
  });
}
