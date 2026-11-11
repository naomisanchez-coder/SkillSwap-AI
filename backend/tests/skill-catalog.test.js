import test from 'node:test';
import assert from 'node:assert/strict';
import { synchronizeSkillCatalog, validateSkillCatalog } from '../database/skill-catalog.js';

const catalog = { version: '1.0.0', scope: 'APPROVED', skills: [
  { id: '123e4567-e89b-12d3-a456-426614174000', code: 'synthetic-one', name: 'Sintética Uno', category: 'Pruebas' },
  { id: '223e4567-e89b-12d3-a456-426614174000', code: 'synthetic-two', name: 'Sintética Dos', category: null },
] };

test('skill catalog accepts only versioned exact stable entries and detects collation-like duplicates', () => {
  assert.deepEqual(validateSkillCatalog(catalog), catalog);
  for (const value of [{ ...catalog, areas: [] }, { ...catalog, skills: [] },
    { ...catalog, skills: [catalog.skills[0], { ...catalog.skills[1], name: 'sintetica uno' }] },
    { ...catalog, skills: [{ ...catalog.skills[0], level: 'advanced' }] }]) {
    assert.throws(() => validateSkillCatalog(value), /Invalid skill catalog/);
  }
});

test('skill catalog check is read-only, apply inserts missing rows and conflicts never overwrite', async () => {
  const rows = new Map(); let inserts = 0;
  const database = { transaction: work => work({ async execute(sql, values) {
    if (sql.startsWith('SELECT id')) return [[...rows.values()].filter(row =>
      row.id === values[0] || row.code === values[1] || row.name === values[2])];
    if (sql.startsWith('INSERT')) { inserts++; rows.set(values[0], { id: values[0], code: values[1],
      name: values[2], category: values[3], is_active: 1 }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT COUNT')) return [[{ total: rows.size }]];
    throw new Error('Unexpected SQL');
  } }) };
  assert.deepEqual(await synchronizeSkillCatalog(database, catalog),
    { version: '1.0.0', scope: 'APPROVED', apply: false, entries: 2, missing: 2, stored: 0 });
  assert.equal(inserts, 0);
  assert.equal((await synchronizeSkillCatalog(database, catalog, { apply: true })).missing, 2);
  assert.equal((await synchronizeSkillCatalog(database, catalog, { apply: true })).missing, 0);
  rows.get(catalog.skills[0].id).category = 'Conflicto';
  await assert.rejects(synchronizeSkillCatalog(database, catalog, { apply: true }), /conflict/);
  assert.equal(inserts, 2);
});
