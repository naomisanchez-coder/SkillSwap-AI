import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function createSessionProtection(keyHex, random = randomBytes) {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex ?? '')) throw new Error('Invalid session CSRF configuration');
  const key = Buffer.from(keyHex, 'hex');
  const calculate = (label, value) => createHmac('sha256', key)
    .update(JSON.stringify(['skillswap-session-v1', label, value])).digest();
  const inspect = (token) => {
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
    const idHash = createHash('sha256').update(token, 'ascii').digest();
    const csrfToken = calculate('csrf-public', token).toString('hex');
    const csrfHmac = calculate('csrf-stored', csrfToken);
    return { idHash, csrfToken, csrfHmac };
  };
  return Object.freeze({
    issue() {
      const token = random(32).toString('hex');
      const values = inspect(token);
      if (!values) throw new Error('Session entropy unavailable');
      return { token, ...values };
    },
    inspect,
    verifyCsrf(token, supplied, stored) {
      const values = inspect(token);
      if (!values || typeof supplied !== 'string' || !/^[0-9a-f]{64}$/.test(supplied) ||
          !Buffer.isBuffer(stored) || stored.length !== 32) return false;
      const suppliedHmac = calculate('csrf-stored', supplied);
      return timingSafeEqual(values.csrfHmac, stored) && timingSafeEqual(suppliedHmac, stored);
    },
  });
}

export function readSessionCookie(header, name = 'skillswap_session') {
  if (typeof header !== 'string' || header.length > 4096) return null;
  const matches = header.split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return /^[0-9a-f]{64}$/.test(value) ? value : null;
}
