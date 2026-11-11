import { constants } from 'node:fs';
import { link, lstat, mkdir, open, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const keyPattern = /^[0-9a-f]{64}$/;

function objectPath(root, key) {
  if (!keyPattern.test(key ?? '')) throw new TypeError('Invalid private storage key');
  return join(root, 'objects', key.slice(0, 2), key);
}

export function createLocalPrivateStorage({ root }, { random = randomBytes } = {}) {
  if (typeof root !== 'string') throw new Error('Private storage root required');
  async function initialize() {
    await mkdir(join(root, '.staging'), { recursive: true, mode: 0o700 });
    await mkdir(join(root, 'objects'), { recursive: true, mode: 0o700 });
    const rootStatus = await lstat(root);
    if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink() || (rootStatus.mode & 0o077) !== 0) {
      throw new Error('Private storage root must be a private real directory');
    }
  }
  return Object.freeze({
    async store(buffer) {
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new TypeError('Non-empty file buffer required');
      await initialize();
      const key = random(32).toString('hex');
      if (!keyPattern.test(key)) throw new Error('Storage entropy unavailable');
      const staging = join(root, '.staging', key);
      const destination = objectPath(root, key);
      let handle;
      try {
        handle = await open(staging, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY |
          (constants.O_NOFOLLOW ?? 0), 0o600);
        await handle.writeFile(buffer);
        await handle.sync();
        await handle.close();
        handle = undefined;
        await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
        await link(staging, destination);
        await unlink(staging);
        return key;
      } catch (error) {
        try { await handle?.close(); } catch {}
        try { await unlink(staging); } catch {}
        throw error;
      }
    },
    async read(key, maximumBytes = 5 * 1024 * 1024) {
      const handle = await open(objectPath(root, key), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const status = await handle.stat();
        if (!status.isFile() || status.size < 1 || status.size > maximumBytes) throw new Error('Private file size mismatch');
        return await handle.readFile();
      }
      finally { await handle.close(); }
    },
    async remove(key) {
      try { await unlink(objectPath(root, key)); return true; }
      catch (error) {
        if (error?.code === 'ENOENT') return false;
        throw error;
      }
    },
  });
}
