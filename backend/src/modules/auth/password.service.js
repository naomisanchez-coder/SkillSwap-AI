import { randomBytes, scrypt } from 'node:crypto';
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
