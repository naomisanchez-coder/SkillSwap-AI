import { PublicError } from '../../errors/PublicError.js';

export function createAiLimiter({ maximum, windowMs }, { now = Date.now, capacity = 10000 } = {}) {
  const entries = new Map();
  return Object.freeze({
    consume(userId) {
      const current = now();
      let entry = entries.get(userId);
      if (!entry || entry.expiresAt <= current) entry = { count: 0, expiresAt: current + windowMs };
      if (entry.count >= maximum) throw new PublicError('RATE_LIMITED');
      entry.count++;
      entries.set(userId, entry);
      if (entries.size > capacity) {
        for (const [key, value] of entries) if (value.expiresAt <= current) entries.delete(key);
        if (entries.size > capacity) entries.delete(entries.keys().next().value);
      }
      return { remaining: maximum - entry.count, resetsAt: new Date(entry.expiresAt) };
    },
  });
}
