import test from 'node:test';
import assert from 'node:assert/strict';
import { readSkillCatalog, synchronizeSkillCatalog } from '../database/skill-catalog.js';
import { demoSkillIdentity } from '../scripts/demo-skills.js';
test('ampliación demo: conserva identidades y admite importación idempotente solo por inserción', async () => {
  const previous = await readSkillCatalog(new URL('../database/catalogs/demo-skills-1.0.0.json', import.meta.url));
  const catalog = await readSkillCatalog(new URL('../database/catalogs/demo-skills-1.1.0.json', import.meta.url));
  assert.deepEqual(catalog.skills.slice(0, 3), previous.skills); assert.equal(catalog.scope, 'DEMO_ONLY'); assert.equal(catalog.skills.length, 9);
  const rows = new Map(previous.skills.map(s => [s.id, { ...s, is_active: 1 }])); const statements = [];
  const db = { async transaction(work) { return work(this); }, async execute(sql, values) {
    statements.push(sql);
    if (sql.startsWith('SELECT COUNT')) return [[{ total: rows.size }]];
    if (sql.startsWith('SELECT')) return [[...rows.values()].filter(r => r.id === values[0] || r.code === values[1] || r.name === values[2])];
    if (sql.startsWith('INSERT')) { rows.set(values[0], { id: values[0], code: values[1], name: values[2], category: values[3], is_active: 1 }); return [{}]; }
    throw new Error('No se permiten modificaciones de registros existentes');
  } };
  assert.equal((await synchronizeSkillCatalog(db, catalog)).missing, 6); assert.equal(rows.size, 3);
  await synchronizeSkillCatalog(db, catalog, { apply: true }); assert.equal(rows.size, 9);
  assert.equal((await synchronizeSkillCatalog(db, catalog, { apply: true })).missing, 0);
  assert.ok(statements.every(sql => /^(SELECT|INSERT)/.test(sql)));
});
test('importador ampliado rechaza otros esquemas y exige autorización separada para escribir', () => {
  const config = { DB_NAME: 'skillswap_ai_demo', DB_USER: 'skillswap_demo_app', DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_PASSWORD: 'offline-fixture' };
  assert.throws(() => demoSkillIdentity(config, true));
  assert.throws(() => demoSkillIdentity({ ...config, DB_NAME: 'skillswap_ai' }, false));
  assert.throws(() => demoSkillIdentity({ ...config, DB_NAME: 'skillswap_ai_test_auth' }, false));
  assert.equal(demoSkillIdentity({ ...config, DEMO_SKILLS_ALLOW_WRITE: 'yes' }, true).database, 'skillswap_ai_demo');
});
