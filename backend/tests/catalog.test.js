import test from 'node:test';
import assert from 'node:assert/strict';
import { readAcademicCatalog, synchronizeAcademicCatalog } from '../database/academic-catalog.js';
import { createDatabase } from '../src/config/db.js';
import { readFile } from 'node:fs/promises';

test('approved academic catalog preserves stable identities and prototype cycles without groupings', async () => {
  const catalog = await readAcademicCatalog();
  assert.equal(catalog.careers.length, 14);
  assert.equal(Object.hasOwn(catalog, 'areas'), false);
  assert.ok(catalog.careers.every((career) => Object.keys(career).sort().join(',') === 'code,id,name'));
  assert.equal(catalog.careers[0].name, 'Diseño y Desarrollo de Software');
  assert.deepEqual(catalog.cycles, [1, 2, 3, 4, 5, 6]);
  for (const name of ['terms', 'privacy']) {
    const text = await readFile(new URL(`../docs/legal/${name}-1.0.0.md`, import.meta.url), 'utf8');
    assert.ok(text.includes('1.0.0'));
    assert.ok(text.includes('revisión jurídica'));
  }
});

test('catalog check has no writes and conflicts fail closed', async () => {
  let writes = 0;
  const db = { transaction: (work) => work({ execute: async (sql) => {
    if (sql.startsWith('INSERT')) writes++;
    return [[]];
  } }) };
  const result = await synchronizeAcademicCatalog(db);
  assert.equal(result.missingCareers, 14);
  assert.equal(result.missingCycles, 84);
  assert.equal(writes, 0);
  await assert.rejects(synchronizeAcademicCatalog({ transaction: (work) => work({ execute: async () => [[{
    id: 'conflict', code: 'software', name: 'wrong', is_active: 1,
  }]] }) }, { apply: true }), /Catalog conflict/);
});

const requested = Object.keys(process.env).some((key) => key.startsWith('DATABASE_TEST_'));
test('real isolated catalog: load and repeat atomically, conflict rolls back and no DDL', {
  skip: requested ? false : 'Isolated DML credentials not configured', timeout: 30000,
}, async () => {
  let db;
  const rollback = new Error('Deliberate isolated rollback');
  try {
    assert.equal(process.env.DATABASE_TEST_DB, 'skillswap_ai_test_auth');
    assert.equal(process.env.DATABASE_TEST_USER, 'skillswap_test_app');
    db = createDatabase({ host: '127.0.0.1', port: 3306, database: process.env.DATABASE_TEST_DB,
      user: process.env.DATABASE_TEST_USER, password: process.env.DATABASE_TEST_PASSWORD });
    const [[identity]] = await db.execute('SELECT CURRENT_USER() AS account');
    assert.equal(identity.account, 'skillswap_test_app@127.0.0.1');
    await assert.rejects(db.transaction(async (tx) => {
      const scoped = { transaction: (work) => work(tx) };
      await synchronizeAcademicCatalog(scoped, { apply: true });
      const repeated = await synchronizeAcademicCatalog(scoped, { apply: true });
      assert.equal(repeated.missingCareers, 0);
      assert.equal(repeated.missingCycles, 0);
      const catalog = await readAcademicCatalog();
      const [rows] = await tx.execute('SELECT cycle FROM career_cycles WHERE career_id = ?', [catalog.careers[0].id]);
      assert.equal(rows.length, 6);
      await tx.execute('UPDATE careers SET is_active = FALSE WHERE id = ?', [catalog.careers[0].id]);
      await assert.rejects(synchronizeAcademicCatalog(scoped, { apply: true }), /Catalog conflict/);
      throw rollback;
    }), (e) => e === rollback);
  } catch (error) {
    throw new Error(`Isolated catalog verification failed (${/^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'CHECK_FAILED'}); no bindings exposed`);
  } finally { if (db) await db.close(); }
});
