import test from 'node:test';
import assert from 'node:assert/strict';
import { readLevelCatalog, synchronizeLevelCatalog, validateLevelCatalog } from '../database/level-catalog.js';

const catalog = { version: '1.0.0', scope: 'DEMO_ONLY', levels: [
  { code: 'demo-initial', name: 'Inicial (demostración)', rank: 25 },
  { code: 'demo-advanced', name: 'Avanzado (demostración)', rank: 75 },
] };

test('level catalog is versioned, scoped and contains no implicit labels', async () => {
  assert.deepEqual(validateLevelCatalog(catalog), catalog);
  const file = await readLevelCatalog(new URL('../database/catalogs/demo-levels-1.0.0.json', import.meta.url));
  assert.equal(file.scope, 'DEMO_ONLY');
  assert.equal(file.levels.length, 3);
  for (const invalid of [{ ...catalog, scope: 'TECSUP' }, { ...catalog, levels: [] },
    { ...catalog, levels: [catalog.levels[0], { ...catalog.levels[1], rank: 25 }] }]) {
    assert.throws(() => validateLevelCatalog(invalid), /Invalid level catalog/);
  }
});

test('level catalog synchronization is read-only by default, idempotent and conflict-safe', async () => {
  const rows = new Map(); let inserts = 0;
  const database = { transaction: work => work({ async execute(sql, values) {
    if (sql.startsWith('SELECT code')) return [[...rows.values()].filter(row =>
      row.code === values[0] || row.name === values[1] || row.rank_value === values[2])];
    if (sql.startsWith('INSERT')) { inserts++; rows.set(values[0], { code: values[0], name: values[1],
      rank_value: values[2], is_active: 1 }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT COUNT')) return [[{ total: rows.size }]];
    throw new Error('Unexpected SQL');
  } }) };
  assert.equal((await synchronizeLevelCatalog(database, catalog)).missing, 2);
  assert.equal(inserts, 0);
  assert.equal((await synchronizeLevelCatalog(database, catalog, { apply: true })).missing, 2);
  assert.equal((await synchronizeLevelCatalog(database, catalog, { apply: true })).missing, 0);
  rows.get('demo-initial').name = 'Conflicto';
  await assert.rejects(synchronizeLevelCatalog(database, catalog, { apply: true }), /conflict/);
  assert.equal(inserts, 2);
});
