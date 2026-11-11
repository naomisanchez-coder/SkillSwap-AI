import { createHash } from 'node:crypto';
import { PublicError } from '../../errors/PublicError.js';

// Technical per-process limits, not account lockouts. No raw addresses/passwords stored.
export function createRegistrationLimiter({ now = Date.now, windowMs = 60000,
  ipLimit = 10, emailLimit = 5, capacity = 2000 } = {}) {
  const buckets = new Map();
  return (request, response, next) => {
    const time = now();
    for (const [key, bucket] of buckets) if (bucket.until <= time) buckets.delete(key);
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const digest = (value) => createHash('sha256').update(value).digest('hex');
    const keys = [[`ip:${digest(request.ip ?? 'unknown')}`, ipLimit]];
    if (email) keys.push([`email:${digest(email)}`, emailLimit]);
    const newKeys = keys.filter(([key]) => !buckets.has(key)).length;
    if (buckets.size + newKeys > capacity) return next(new PublicError('SERVICE_UNAVAILABLE'));
    for (const [key, limit] of keys) {
      const bucket = buckets.get(key);
      if (bucket?.count >= limit) {
        response.set('Retry-After', String(Math.max(1, Math.ceil((bucket.until - time) / 1000))));
        return next(new PublicError('RATE_LIMITED'));
      }
    }
    for (const [key] of keys) {
      const bucket = buckets.get(key) ?? { count: 0, until: time + windowMs };
      bucket.count++;
      buckets.set(key, bucket);
    }
    next();
  };
}
