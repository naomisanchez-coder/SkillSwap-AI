import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLocalPrivateStorage } from '../src/adapters/private-storage.js';

test('local private storage uses random opaque paths, private modes and explicit removal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skillswap-private-'));
  const key = 'ab'.repeat(32);
  const storage = createLocalPrivateStorage({ root }, { random: () => Buffer.from(key, 'hex') });
  try {
    const stored = await storage.store(Buffer.from('private evidence'));
    assert.equal(stored, key);
    assert.deepEqual(await storage.read(stored), Buffer.from('private evidence'));
    const target = join(root, 'objects', 'ab', key);
    assert.deepEqual(await readFile(target), Buffer.from('private evidence'));
    assert.equal((await stat(root)).mode & 0o777, 0o700);
    assert.equal((await stat(target)).mode & 0o777, 0o600);
    assert.equal(await storage.remove(stored), true);
    assert.equal(await storage.remove(stored), false);
    await assert.rejects(storage.read('../../outside'), TypeError);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('storage removes staging files when a write or promotion fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skillswap-private-'));
  const storage = createLocalPrivateStorage({ root }, { random: () => Buffer.alloc(32) });
  try {
    await storage.store(Buffer.from('first'));
    await assert.rejects(storage.store(Buffer.from('duplicate')));
    assert.deepEqual(await storage.read('0'.repeat(64)), Buffer.from('first'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
