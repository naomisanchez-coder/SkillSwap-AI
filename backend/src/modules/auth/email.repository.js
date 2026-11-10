export function createEmailRepository(database) {
  return Object.freeze({
    health: () => database.check(),
    async reserve({ id, email, digest, keyVersion, policy }) {
      return database.transaction(async (tx) => {
        // All issuance/verification writers must acquire this user lock first.
        const [users] = await tx.execute('SELECT id, email, role, status, email_verified_at FROM users WHERE email = ? FOR UPDATE', [email]);
        const user = users[0];
        if (!user || user.role !== 'STUDENT' || user.status !== 'PENDING_VERIFICATION' || user.email_verified_at !== null) return null;
        const [[clock]] = await tx.execute('SELECT UTC_TIMESTAMP(6) AS now');
        const now = clock.now;
        const [recent] = await tx.execute(
          'SELECT created_at FROM email_verifications WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC',
          [user.id, new Date(now.getTime() - policy.windowSeconds * 1000)]);
        // Count all issuance records, including expired/revoked/failed delivery attempts.
        if (recent.length >= policy.maxPerWindow ||
            (recent[0] && now.getTime() - recent[0].created_at.getTime() < policy.cooldownSeconds * 1000)) return null;
        await tx.execute("UPDATE email_verifications SET status = CASE WHEN expires_at <= ? THEN 'EXPIRED' ELSE 'REVOKED' END WHERE user_id = ? AND status = 'PENDING'", [now, user.id]);
        const expiresAt = new Date(now.getTime() + policy.ttlSeconds * 1000);
        await tx.execute(`INSERT INTO email_verifications
          (id, user_id, code_hmac, hmac_key_version, max_attempts, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, user.id, digest, keyVersion, policy.maxAttempts, expiresAt, now]);
        return { to: user.email, expiresAt };
      });
    },
    async revoke(id) {
      await database.execute("UPDATE email_verifications SET status = 'REVOKED' WHERE id = ? AND status = 'PENDING'", [id]);
    },
  });
}
