import { randomUUID, timingSafeEqual } from 'node:crypto';

const INITIAL_CREDITS = 20;
const INITIAL_REASON = 'INITIAL_EMAIL_VERIFICATION';

function digestMatches(candidate, stored) {
  return Buffer.isBuffer(candidate) && candidate.length === 32 &&
    Buffer.isBuffer(stored) && stored.length === 32 && timingSafeEqual(candidate, stored);
}

export function createEmailVerificationRepository(database) {
  return Object.freeze({
    async verify({ id, email, digest, keyVersion }) {
      return database.transaction(async tx => {
        // Discover ownership without locking, then preserve the global user -> challenge lock order.
        const [owners] = await tx.execute('SELECT user_id FROM email_verifications WHERE id = ?', [id]);
        if (owners.length !== 1) return { outcome: 'INVALID' };
        const userId = owners[0].user_id;
        const [users] = await tx.execute(
          'SELECT id,email,role,status,email_verified_at FROM users WHERE id = ? FOR UPDATE', [userId]);
        const user = users[0];
        const [challenges] = await tx.execute(
          'SELECT id,user_id,code_hmac,hmac_key_version,status,attempts,max_attempts,expires_at FROM email_verifications WHERE id = ? AND user_id = ? FOR UPDATE',
          [id, userId]);
        const challenge = challenges[0];
        if (!user || !challenge || user.email !== email || user.role !== 'STUDENT' ||
            user.status !== 'PENDING_VERIFICATION' || user.email_verified_at !== null || challenge.status !== 'PENDING') {
          return { outcome: 'INVALID' };
        }
        const [[clock]] = await tx.execute('SELECT UTC_TIMESTAMP(6) AS now');
        const now = clock.now;
        if (challenge.expires_at <= now) {
          const [expired] = await tx.execute("UPDATE email_verifications SET status = 'EXPIRED' WHERE id = ? AND status = 'PENDING'", [id]);
          if (expired.affectedRows !== 1) throw new Error('Verification state changed unexpectedly');
          return { outcome: 'INVALID' };
        }
        if (challenge.attempts >= challenge.max_attempts) {
          const [exhausted] = await tx.execute("UPDATE email_verifications SET status = 'EXHAUSTED' WHERE id = ? AND status = 'PENDING'", [id]);
          if (exhausted.affectedRows !== 1) throw new Error('Verification state changed unexpectedly');
          return { outcome: 'INVALID' };
        }
        if (challenge.hmac_key_version !== keyVersion || !digestMatches(digest, challenge.code_hmac)) {
          const attempts = challenge.attempts + 1;
          const status = attempts >= challenge.max_attempts ? 'EXHAUSTED' : 'PENDING';
          const [attempted] = await tx.execute('UPDATE email_verifications SET attempts = ?, status = ? WHERE id = ? AND status = ?',
            [attempts, status, id, 'PENDING']);
          if (attempted.affectedRows !== 1) throw new Error('Verification state changed unexpectedly');
          return { outcome: 'INVALID' };
        }
        const [consumed] = await tx.execute("UPDATE email_verifications SET status = 'CONSUMED', consumed_at = ? WHERE id = ? AND status = 'PENDING'", [now, id]);
        if (consumed.affectedRows !== 1) throw new Error('Verification state changed unexpectedly');
        const [activated] = await tx.execute("UPDATE users SET status = 'ACTIVE', email_verified_at = ? WHERE id = ? AND status = 'PENDING_VERIFICATION'", [now, userId]);
        if (activated.affectedRows !== 1) throw new Error('User state changed unexpectedly');
        const [granted] = await tx.execute(
          'INSERT INTO credit_transactions (id,user_id,amount,reason,operation_reference,verification_id) VALUES (?,?,?,?,?,?)',
          [randomUUID(), userId, INITIAL_CREDITS, INITIAL_REASON, `initial-email-verification:${userId}`, id]);
        if (granted.affectedRows !== 1) throw new Error('Initial credit grant failed');
        return { outcome: 'VERIFIED', creditsGranted: INITIAL_CREDITS };
      });
    },
  });
}
