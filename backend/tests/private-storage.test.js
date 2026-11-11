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

test('almacenamiento integrado: lee archivos previos, pero cargas y limpieza nunca modifican el origen', async () => {
  const { createLayeredPrivateStorage } = await import('../src/adapters/private-storage.js');
  const source = await mkdtemp(join(tmpdir(), 'skillswap-origin-'));
  const target = await mkdtemp(join(tmpdir(), 'skillswap-worktree-'));
  const original = createLocalPrivateStorage({ root: source });
  try {
    const key = await original.store(Buffer.from('existing certificate'));
    const layered = createLayeredPrivateStorage({ root: target, readOnlyRoot: source });
    assert.deepEqual(await layered.read(key), Buffer.from('existing certificate'));
    assert.equal(await layered.remove(key), false);
    assert.deepEqual(await original.read(key), Buffer.from('existing certificate'));
    const added = await layered.store(Buffer.from('new photo'));
    await assert.rejects(original.read(added), error => error.code === 'ENOENT');
    assert.deepEqual(await layered.read(added), Buffer.from('new photo'));
    assert.equal(await layered.remove(added), true);
    assert.deepEqual(await original.read(key), Buffer.from('existing certificate'));
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});
