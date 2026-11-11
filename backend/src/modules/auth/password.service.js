import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PublicError } from '../../errors/PublicError.js';

const derive = promisify(scrypt);
const cost = Object.freeze({ N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
// Bound memory use process-wide; never queue unlimited passwords in memory.
let running = 0;

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0 || Buffer.byteLength(password, 'utf8') > 512) {
    throw new TypeError('Password input exceeds the hashing boundary');
  }
  if (running >= 2) throw new PublicError('SERVICE_UNAVAILABLE');
  running++;
  try {
    const salt = randomBytes(16);
    const key = await derive(password, salt, 32, cost);
    try {
      return `$scrypt$N=131072,r=8,p=1$${salt.toString('hex')}$${key.toString('hex')}`;
    } finally { key.fill(0); }
  } finally { running--; }
}

const encodedPattern = /^\$scrypt\$N=131072,r=8,p=1\$([0-9a-f]{32})\$([0-9a-f]{64})$/;
// Valid encoded value used only to equalize work for unknown accounts.
export const dummyPasswordHash = '$scrypt$N=131072,r=8,p=1$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || !password.isWellFormed() || !password.length ||
      Buffer.byteLength(password, 'utf8') > 512) return false;
  const encodedMatch = typeof encoded === 'string' ? encoded.match(encodedPattern) : null;
  const match = encodedMatch ?? dummyPasswordHash.match(encodedPattern);
  if (running >= 2) throw new PublicError('SERVICE_UNAVAILABLE');
  running++;
  try {
    const expected = Buffer.from(match[2], 'hex');
    const actual = await derive(password, Buffer.from(match[1], 'hex'), expected.length, cost);
    try { return Boolean(encodedMatch) && timingSafeEqual(actual, expected); }
    finally { actual.fill(0); expected.fill(0); }
  } finally { running--; }
}
