import { passwordRecoveryPolicy } from './password-recovery.policy.js';

function validIdentifier(value) { return Buffer.isBuffer(value) && value.length === 32; }

export function createPasswordRecoveryRateRepository(database, policy = passwordRecoveryPolicy) {
  if (!database || policy.windowSeconds !== 3600 || policy.cooldownSeconds !== 60 ||
      policy.emailLimit !== 5 || policy.ipLimit !== 20 || policy.retentionSeconds !== 86400 ||
      policy.cleanupBatch !== 100) throw new Error('Approved recovery rate policy required');
  return Object.freeze({
    async take({ emailHmac, ipHmac }) {
      if (!validIdentifier(emailHmac) || !validIdentifier(ipHmac)) throw new Error('Invalid recovery rate identifier');
      return database.transaction(async tx => {
        const [[clock]] = await tx.execute('SELECT UTC_TIMESTAMP(6) AS now');
        const now = clock.now; if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Invalid database clock');
        const expiresAt = new Date(now.getTime() + policy.windowSeconds * 1000);
        const entries = [['EMAIL', emailHmac], ['IP', ipHmac]];
        for (const [scope, identifier] of entries) await tx.execute(`INSERT INTO password_recovery_limits
          (scope,identifier_hmac,window_started_at,expires_at,admissions) VALUES (?,?,?,?,0)
          ON DUPLICATE KEY UPDATE identifier_hmac=identifier_hmac`, [scope, identifier, now, expiresAt]);
        const rows = [];
        for (const [scope, identifier] of entries) {
          const [[row]] = await tx.execute(`SELECT scope,window_started_at,expires_at,last_admitted_at,admissions
            FROM password_recovery_limits WHERE scope=? AND identifier_hmac=? FOR UPDATE`, [scope, identifier]);
          if (!row) throw new Error('Recovery rate row unavailable');
          if (row.expires_at <= now) {
            const [reset] = await tx.execute(`UPDATE password_recovery_limits SET window_started_at=?,expires_at=?,
              last_admitted_at=NULL,admissions=0 WHERE scope=? AND identifier_hmac=?`, [now, expiresAt, scope, identifier]);
            if (reset.affectedRows !== 1) throw new Error('Recovery rate reset failed');
            rows.push({ scope, expires_at: expiresAt, last_admitted_at: null, admissions: 0 });
          } else rows.push(row);
        }
        const waits = rows.map(row => {
          const limit = row.scope === 'EMAIL' ? policy.emailLimit : policy.ipLimit;
          const windowWait = Number(row.admissions) >= limit ? row.expires_at.getTime() - now.getTime() : 0;
          const cooldownWait = row.scope === 'EMAIL' && row.last_admitted_at
            ? row.last_admitted_at.getTime() + policy.cooldownSeconds * 1000 - now.getTime() : 0;
          return Math.max(windowWait, cooldownWait, 0);
        });
        if (waits.some(wait => wait > 0)) return { allowed: false,
          retryAfter: Math.max(1, Math.ceil(Math.max(...waits) / 1000)) };
        for (const [scope, identifier] of entries) {
          const [updated] = await tx.execute(`UPDATE password_recovery_limits
            SET admissions=admissions+1,last_admitted_at=? WHERE scope=? AND identifier_hmac=?`,
          [now, scope, identifier]);
          if (updated.affectedRows !== 1) throw new Error('Recovery rate reservation failed');
        }
        return { allowed: true };
      });
    },
    async cleanupExpired(now = new Date()) {
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new TypeError('Invalid recovery cleanup clock');
      }
      const cutoff = new Date(now.getTime() - policy.retentionSeconds * 1000);
      const [result] = await database.execute(
        'DELETE FROM password_recovery_limits WHERE expires_at < ? ORDER BY expires_at LIMIT 100',
        [cutoff],
      );
      return result.affectedRows;
    },
  });
}
