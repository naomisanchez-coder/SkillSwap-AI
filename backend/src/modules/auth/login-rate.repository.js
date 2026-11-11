import { loginRatePolicy } from '../../config/login-security.js';

function validateIdentifier(value) {
  if (!Buffer.isBuffer(value) || value.length !== 32) throw new Error('Invalid login rate identifier');
}

export function createLoginRateRepository(database, policy = loginRatePolicy) {
  if (!database || policy.windowSeconds !== 900 || policy.emailLimit !== 5 || policy.ipLimit !== 20) {
    throw new Error('Approved login rate policy required');
  }
  return Object.freeze({
    async take({ emailHmac, ipHmac }) {
      validateIdentifier(emailHmac); validateIdentifier(ipHmac);
      return database.transaction(async tx => {
        const [[clock]] = await tx.execute('SELECT UTC_TIMESTAMP(6) AS now');
        const now = clock.now;
        if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Invalid database clock');
        const expiresAt = new Date(now.getTime() + policy.windowSeconds * 1000);
        const entries = [['EMAIL', emailHmac], ['IP', ipHmac]];
        for (const [scope, identifier] of entries) {
          await tx.execute(`INSERT INTO login_rate_limits
            (scope,identifier_hmac,window_started_at,expires_at,attempts)
            VALUES (?,?,?,?,0) ON DUPLICATE KEY UPDATE identifier_hmac=identifier_hmac`,
          [scope, identifier, now, expiresAt]);
        }
        const rows = [];
        // Deterministic EMAIL -> IP order prevents lock-order cycles across requests.
        for (const [scope, identifier] of entries) {
          const [[row]] = await tx.execute(`SELECT scope,attempts,window_started_at,expires_at
            FROM login_rate_limits WHERE scope=? AND identifier_hmac=? FOR UPDATE`, [scope, identifier]);
          if (!row) throw new Error('Login rate row unavailable');
          if (row.expires_at <= now) {
            const [reset] = await tx.execute(`UPDATE login_rate_limits
              SET window_started_at=?,expires_at=?,attempts=0 WHERE scope=? AND identifier_hmac=?`,
            [now, expiresAt, scope, identifier]);
            if (reset.affectedRows !== 1) throw new Error('Login rate reset failed');
            rows.push({ scope, attempts: 0, expires_at: expiresAt });
          } else rows.push(row);
        }
        const limits = { EMAIL: policy.emailLimit, IP: policy.ipLimit };
        const blocked = rows.filter(row => Number(row.attempts) >= limits[row.scope]);
        if (blocked.length) return { allowed: false, retryAfter: Math.max(...blocked.map(row =>
          Math.max(1, Math.ceil((row.expires_at.getTime() - now.getTime()) / 1000)))) };
        for (const [scope, identifier] of entries) {
          const [updated] = await tx.execute(`UPDATE login_rate_limits SET attempts=attempts+1
            WHERE scope=? AND identifier_hmac=?`, [scope, identifier]);
          if (updated.affectedRows !== 1) throw new Error('Login rate reservation failed');
        }
        return { allowed: true };
      });
    },
    async cleanupExpired(now = new Date()) {
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Invalid cleanup clock');
      const cutoff = new Date(now.getTime() - policy.retentionSeconds * 1000);
      const [result] = await database.execute(
        'DELETE FROM login_rate_limits WHERE expires_at < ? ORDER BY expires_at LIMIT 100', [cutoff]);
      return result.affectedRows;
    },
  });
}
