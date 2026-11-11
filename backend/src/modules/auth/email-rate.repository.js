import { otpPolicy } from './email.policy.js';

export function createEmailRateRepository(database) {
  return Object.freeze({
    async take(emailHmac) {
      if (!Buffer.isBuffer(emailHmac) || emailHmac.length !== 32) throw new Error('Invalid rate identifier');
      return database.transaction(async tx => {
        // Unique insert serializes new identifiers too; no unknown-email FK is needed.
        await tx.execute('INSERT INTO otp_request_limits (email_hmac) VALUES (?) ON DUPLICATE KEY UPDATE email_hmac = email_hmac', [emailHmac]);
        const [[row]] = await tx.execute('SELECT request_1_at, request_2_at, request_3_at, request_4_at, request_5_at FROM otp_request_limits WHERE email_hmac = ? FOR UPDATE', [emailHmac]);
        const [[clock]] = await tx.execute('SELECT UTC_TIMESTAMP(6) AS now');
        const now = clock.now.getTime();
        if (!Number.isFinite(now)) throw new Error('Invalid database clock');
        const dates = Array.from({length:5},(_,i)=>row[`request_${i+1}_at`]).filter(Boolean);
        if (dates.some((d,i)=>!Number.isFinite(d.getTime()) || d.getTime()>now || (i && d<dates[i-1]))) throw new Error('Invalid rate history');
        const recent = dates.filter(d => d.getTime() > now - otpPolicy.windowSeconds * 1000);
        const wait = Math.max(0,
          recent.length ? recent.at(-1).getTime() + otpPolicy.cooldownSeconds * 1000 - now : 0,
          recent.length >= 5 ? recent[0].getTime() + otpPolicy.windowSeconds * 1000 - now : 0);
        if (wait > 0) return { allowed: false, retryAfter: Math.max(1, Math.ceil(wait/1000)) };
        const next = [...recent, new Date(now)];
        await tx.execute('UPDATE otp_request_limits SET request_1_at = ?, request_2_at = ?, request_3_at = ?, request_4_at = ?, request_5_at = ? WHERE email_hmac = ?',
          [...Array.from({length:5},(_,i)=>next[i]??null),emailHmac]);
        return { allowed: true };
      });
    },
  });
}
