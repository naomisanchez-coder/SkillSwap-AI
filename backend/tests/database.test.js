import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../src/config/db.js';

function fixture(failAt, fatal = false) {
  const calls = [];
  const error = Object.assign(new Error('internal database error'), { fatal });
  let options;
  const connection = {
    async query(sql) { calls.push(['utc', sql]); if (failAt === 'utc') throw error; },
    async execute(query, values) {
      calls.push(['execute', query.sql, values]);
      if (failAt === 'execute') throw error;
      return [[{ value: values?.[0] }], []];
    },
    async beginTransaction() { calls.push(['begin']); if (failAt === 'begin') throw error; },
    async commit() { calls.push(['commit']); if (failAt === 'commit') throw error; },
    async rollback() { calls.push(['rollback']); if (failAt === 'rollback') throw error; },
    release() { calls.push(['release']); },
    destroy() { calls.push(['destroy']); },
  };
  const pool = {
    async getConnection() { calls.push(['acquire']); if (failAt === 'acquire') throw error; return connection; },
    async end() { calls.push(['end']); },
  };
  const database = createDatabase({ password: randomUUID() }, {
    poolFactory(config) { options = config; return pool; },
  });
  return { database, calls, error, options, connection };
}
const names = (calls) => calls.map(([name]) => name);

test('prepared execution binds values separately, initializes UTC and releases connection', async () => {
  const f = fixture();
  const value = "x'); DROP TABLE users; --";
  const [rows] = await f.database.execute('SELECT ? AS value', [value]);
  assert.equal(rows[0].value, value);
  assert.deepEqual(f.calls[2], ['execute', 'SELECT ? AS value', [value]]);
  assert.deepEqual(names(f.calls), ['acquire', 'utc', 'execute', 'release']);
  assert.equal(f.options.timezone, 'Z');
  assert.equal(f.calls[1][1].timeout, 5000);
  assert.equal(f.options.multipleStatements, false);
  await f.database.close();
  assert.equal(f.calls.at(-1)[0], 'end');
});

test('transaction uses one checkout, commits return value and closes scoped executor', async () => {
  const f = fixture();
  let captured;
  const result = await f.database.transaction(async (tx) => {
    captured = tx;
    await tx.execute('INSERT INTO careers (id) VALUES (?)', ['synthetic']);
    await tx.execute('SELECT ? AS value', [2]);
    return 'complete';
  });
  assert.equal(result, 'complete');
  assert.deepEqual(names(f.calls), ['acquire', 'utc', 'begin', 'execute', 'execute', 'commit', 'release']);
  assert.throws(() => captured.execute('SELECT 1'), /scope is closed/);
});

test('callback and query errors roll back, preserve original identity and release', async () => {
  for (const failQuery of [false, true]) {
    const f = fixture(failQuery ? 'execute' : undefined);
    const original = failQuery ? f.error : new Error('business failure');
    await assert.rejects(f.database.transaction(async (tx) => {
      await tx.execute('SELECT ?', [1]);
      throw original;
    }), (error) => error === original);
    assert.deepEqual(names(f.calls), ['acquire', 'utc', 'begin', 'execute', 'rollback', 'release']);
  }
});

test('rollback failure discards connection and does not mask original callback error', async () => {
  const f = fixture('rollback');
  const original = new Error('original failure');
  await assert.rejects(f.database.transaction(async () => { throw original; }), (e) => e === original);
  assert.deepEqual(names(f.calls), ['acquire', 'utc', 'begin', 'rollback', 'destroy']);
});

test('commit failure attempts rollback, discards uncertain connection and never retries', async () => {
  const f = fixture('commit');
  await assert.rejects(f.database.transaction(async () => 1), (e) => e === f.error);
  assert.deepEqual(names(f.calls), ['acquire', 'utc', 'begin', 'commit', 'rollback', 'destroy']);
});

test('checkout, initialization and begin failures never leak connections', async () => {
  for (const step of ['acquire', 'utc', 'begin']) {
    const f = fixture(step);
    await assert.rejects(f.database.transaction(async () => assert.fail()), (e) => e === f.error);
    assert.deepEqual(names(f.calls), step === 'acquire' ? ['acquire'] :
      step === 'utc' ? ['acquire', 'utc', 'destroy'] : ['acquire', 'utc', 'begin', 'destroy']);
  }
});

test('standalone query errors release healthy connections and discard fatal connections', async () => {
  for (const fatal of [false, true]) {
    const f = fixture('execute', fatal);
    await assert.rejects(f.database.execute('SELECT 1'), (e) => e === f.error);
    assert.equal(f.calls.at(-1)[0], fatal ? 'destroy' : 'release');
  }
});

test('unsafe API use is rejected before acquiring a connection', async () => {
  const f = fixture();
  for (const sql of ['DROP TABLE users', 'COMMIT', 'START TRANSACTION', 'SET time_zone = 1', undefined]) {
    assert.throws(() => f.database.execute(sql), TypeError);
  }
  assert.throws(() => f.database.execute('SELECT ?', { value: 1 }), TypeError);
  await assert.rejects(f.database.transaction(null), TypeError);
  assert.equal(f.calls.length, 0);
  assert.throws(() => createDatabase({}, { ssl: { rejectUnauthorized: false } }), /TLS verification/);
});

test('health check remains independent of data writes and rejects absent secret', async () => {
  const f = fixture();
  await f.database.check();
  assert.equal(f.calls[2][1], 'SELECT 1');
  const missing = createDatabase({}, { poolFactory: () => ({ end() {} }) });
  await assert.rejects(missing.check(), /not configured/);
});

const integrationRequested = Object.keys(process.env).some((key) => key.startsWith('DATABASE_TEST_'));
test('real DML-only isolated integration: UTC, parameter binding, commit and rollback', {
  skip: integrationRequested ? false : 'No isolated DML test account configured', timeout: 30000,
}, async () => {
  let database;
  const ids = [randomUUID(), randomUUID()];
  try {
    assert.equal(process.env.DATABASE_TEST_DB, 'skillswap_ai_test_auth');
    assert.equal(process.env.DATABASE_TEST_USER, 'skillswap_test_app');
    assert.ok(process.env.DATABASE_TEST_PASSWORD);
    database = createDatabase({ host: '127.0.0.1', port: 3306, database: 'skillswap_ai_test_auth',
      user: process.env.DATABASE_TEST_USER, password: process.env.DATABASE_TEST_PASSWORD });
    const [identity] = await database.execute('SELECT CURRENT_USER() AS account, CURRENT_ROLE() AS roles, DATABASE() AS db, @@GLOBAL.partial_revokes AS partialRevokes');
    assert.equal(identity[0].roles, 'NONE');
    assert.equal(identity[0].account, 'skillswap_test_app@127.0.0.1');
    assert.equal(identity[0].db, 'skillswap_ai_test_auth');
    assert.ok([0, 1].includes(identity[0].partialRevokes));
    const exactScope = identity[0].partialRevokes === 0
      ? 'skillswap\\_ai\\_test\\_auth' : 'skillswap_ai_test_auth';
    const [grants] = await database.execute('SELECT PRIVILEGE_TYPE AS privilegeName FROM information_schema.USER_PRIVILEGES WHERE GRANTEE = CONCAT(CHAR(39), SUBSTRING_INDEX(CURRENT_USER(), CHAR(64), 1), CHAR(39), CHAR(64), CHAR(39), SUBSTRING_INDEX(CURRENT_USER(), CHAR(64), -1), CHAR(39))');
    assert.ok(grants.every((row) => row.privilegeName === 'USAGE'), 'Operational global privileges are not allowed');
    const [schemaGrants] = await database.execute('SELECT TABLE_SCHEMA AS schemaName, PRIVILEGE_TYPE AS privilegeName FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE = CONCAT(CHAR(39), SUBSTRING_INDEX(CURRENT_USER(), CHAR(64), 1), CHAR(39), CHAR(64), CHAR(39), SUBSTRING_INDEX(CURRENT_USER(), CHAR(64), -1), CHAR(39))');
    const privileges = new Set();
    for (const row of schemaGrants) {
      assert.equal(row.schemaName, exactScope);
      assert.ok(['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(row.privilegeName), 'Only DML privileges are permitted');
      privileges.add(row.privilegeName);
    }
    assert.ok(['SELECT', 'INSERT', 'UPDATE', 'DELETE'].every((p) => privileges.has(p)));
    const value = "bound'); DROP TABLE users; --";
    const [bound] = await database.execute('SELECT ? AS value, @@session.time_zone AS zone', [value]);
    assert.equal(bound[0].value, value);
    assert.equal(bound[0].zone, '+00:00');
    const instant = new Date('2026-01-01T01:02:03.000Z');
    const [dates] = await database.execute('SELECT CAST(? AS DATETIME(6)) AS instant', [instant]);
    assert.equal(dates[0].instant.toISOString(), instant.toISOString());
    const insert = (tx, id) => tx.execute('INSERT INTO careers (id, code, name) VALUES (?, ?, ?)',
      [id, `TX_${id}`, 'Catalogo sintetico temporal']);
    // A real read-only COMMIT verifies the success path without persisting fixtures.
    const committed = await database.transaction(async (tx) => {
      const [before] = await tx.execute('SELECT CONNECTION_ID() AS id');
      const [after] = await tx.execute('SELECT CONNECTION_ID() AS id, ? AS value', [value]);
      assert.equal(before[0].id, after[0].id);
      return after[0].value;
    });
    assert.equal(committed, value);
    const original = new Error('rollback-only synthetic failure');
    await assert.rejects(database.transaction(async (tx) => {
      await insert(tx, ids[0]);
      const [visible] = await tx.execute('SELECT id FROM careers WHERE id = ?', [ids[0]]);
      assert.equal(visible.length, 1);
      throw original;
    }), (e) => e === original);
    const [rolledBack] = await database.execute('SELECT id FROM careers WHERE id = ?', [ids[0]]);
    assert.equal(rolledBack.length, 0);
    await assert.rejects(database.transaction(async (tx) => {
      await insert(tx, ids[1]);
      await insert(tx, ids[1]);
    }), (error) => error.code === 'ER_DUP_ENTRY');
    const [afterQueryError] = await database.execute('SELECT id FROM careers WHERE id = ?', [ids[1]]);
    assert.equal(afterQueryError.length, 0);
  } catch (error) {
    const code = /^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'INTEGRATION_CHECK_FAILED';
    throw new Error(`Isolated DML integration failed (${code}); no internal error details exposed`);
  } finally {
    await database?.close();
  }
});
