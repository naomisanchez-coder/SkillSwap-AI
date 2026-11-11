import { otpSchemaVersion } from './email.policy.js';

export function createEmailRepository(database) {
  return Object.freeze({
    async health() {
      await database.check();
      const [rows] = await database.execute('SELECT version FROM schema_migrations WHERE version = ?', [otpSchemaVersion]);
      if (rows.length !== 1) throw new Error('OTP schema not ready');
    },
    async reserve({ id, email, digest, keyVersion, policy }) {
      return database.transaction(async (tx) => {
        // All issuance/verification writers must acquire this user lock first.
        const [users] = await tx.execute('SELECT id, email, role, status, email_verified_at FROM users WHERE email = ? FOR UPDATE', [email]);
        const user = users[0];
        if (!user || user.role !== 'STUDENT' || user.status !== 'PENDING_VERIFICATION' || user.email_verified_at !== null) return null;
        const [[clock]] = await tx.execute('SELECT UTC_TIMESTAMP(6) AS now');
        const now = clock.now;
        await tx.execute("UPDATE email_verifications SET status = CASE WHEN expires_at <= ? THEN 'EXPIRED' ELSE 'REVOKED' END WHERE user_id = ? AND status IN ('PENDING', 'SENDING')", [now, user.id]);
        const expiresAt = new Date(now.getTime() + policy.ttlSeconds * 1000);
        await tx.execute(`INSERT INTO email_verifications
          (id, user_id, code_hmac, hmac_key_version, max_attempts, expires_at, created_at, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'SENDING')`, [id, user.id, digest, keyVersion, policy.maxAttempts, expiresAt, now]);
        return { to: user.email, expiresAt };
      });
    },
    async confirmDelivery(id) {
      return database.transaction(async tx => {
        // Discover owner without taking locks out of order; then user -> challenge.
        const [owners] = await tx.execute('SELECT user_id FROM email_verifications WHERE id = ?', [id]);
        if (owners.length !== 1) return false;
        const [users] = await tx.execute('SELECT id, role, status, email_verified_at FROM users WHERE id = ? FOR UPDATE', [owners[0].user_id]);
        const user = users[0];
        if (!user || user.role !== 'STUDENT' || user.status !== 'PENDING_VERIFICATION' || user.email_verified_at !== null) return false;
        // A revoked/replaced/expired row cannot be resurrected by a late SMTP completion.
        const [result] = await tx.execute("UPDATE email_verifications SET status = 'PENDING' WHERE id = ? AND user_id = ? AND status = 'SENDING' AND expires_at > UTC_TIMESTAMP(6)", [id,user.id]);
        return result.affectedRows === 1;
      });
    },
    async revoke(id) {
      await database.execute("UPDATE email_verifications SET status = 'REVOKED' WHERE id = ? AND status IN ('SENDING', 'PENDING')", [id]);
    },
  });
}
