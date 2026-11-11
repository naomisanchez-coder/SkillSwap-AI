import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createPasswordRecoveryRateIdentifiers } from '../src/modules/auth/password-recovery.js';
import { createPasswordRecoveryRateRepository } from '../src/modules/auth/password-recovery-rate.repository.js';

function memoryDatabase(start = new Date('2026-01-01T00:00:00Z')) {
  const state = { now: start, rows: new Map() }; let queue = Promise.resolve();
  const id = (scope, value) => `${scope}:${value.toString('hex')}`;
  const tx = { async execute(sql, values = []) {
    if (sql.startsWith('SELECT UTC_TIMESTAMP')) return [[{ now: new Date(state.now) }]];
    if (sql.startsWith('INSERT INTO password_recovery_limits')) { const [scope, value, window, expiry] = values;
      if (!state.rows.has(id(scope, value))) state.rows.set(id(scope, value), { scope,
        window_started_at: new Date(window), expires_at: new Date(expiry), last_admitted_at: null, admissions: 0 });
      return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT scope,window_started_at')) { const [scope, value] = values;
      const row = state.rows.get(id(scope, value)); return [[row ? { ...row } : undefined]]; }
    if (sql.includes('last_admitted_at=NULL')) { const [window, expiry, scope, value] = values;
      Object.assign(state.rows.get(id(scope, value)), { window_started_at: new Date(window), expires_at: new Date(expiry),
        last_admitted_at: null, admissions: 0 }); return [{ affectedRows: 1 }]; }
    if (sql.includes('SET admissions=admissions+1')) { const [now, scope, value] = values;
      const row = state.rows.get(id(scope, value)); row.admissions++; row.last_admitted_at = new Date(now);
      return [{ affectedRows: 1 }]; }
    throw new Error('Unexpected simulated recovery SQL');
  } };
  return {
    state,
    transaction(work) { const run = queue.then(() => work(tx)); queue = run.catch(() => {}); return run; },
    async execute(sql, values = []) {
      if (!sql.startsWith('DELETE FROM password_recovery_limits')) throw new Error('Unexpected cleanup SQL');
      const [cutoff] = values; let removed = 0;
      for (const [rowId, row] of state.rows) {
        if (removed >= 100) break;
        if (row.expires_at < cutoff) { state.rows.delete(rowId); removed++; }
      }
      return [{ affectedRows: removed }];
    },
  };
}
const key = () => randomBytes(32).toString('hex');

test('recovery admission enforces 60-second cooldown without extending fixed window', async () => {
  const database = memoryDatabase(), identify = createPasswordRecoveryRateIdentifiers(key());
  const repository = createPasswordRecoveryRateRepository(database); const input = {
    emailHmac: identify.email('user@example.com'), ipHmac: identify.ip('127.0.0.1') };
  assert.deepEqual(await repository.take(input), { allowed: true });
  const expiry = [...database.state.rows.values()].find(row => row.scope === 'EMAIL').expires_at.getTime();
  assert.deepEqual(await repository.take(input), { allowed: false, retryAfter: 60 });
  database.state.now = new Date(database.state.now.getTime() + 30000);
  assert.deepEqual(await repository.take(input), { allowed: false, retryAfter: 30 });
  assert.equal([...database.state.rows.values()].find(row => row.scope === 'EMAIL').expires_at.getTime(), expiry);
});

test('five email and twenty IP admissions are persistent and reset after fixed hour', async () => {
  const database = memoryDatabase(), identify = createPasswordRecoveryRateIdentifiers(key());
  const repository = createPasswordRecoveryRateRepository(database), emailHmac = identify.email('user@example.com');
  for (let n = 0; n < 5; n++) { const result = await repository.take({ emailHmac,
    ipHmac: identify.ip(`192.0.2.${n}`) }); assert.equal(result.allowed, true);
    database.state.now = new Date(database.state.now.getTime() + 60000); }
  assert.equal((await repository.take({ emailHmac, ipHmac: identify.ip('192.0.2.10') })).allowed, false);
  const other = memoryDatabase(), shared = identify.ip('198.51.100.1'), ipRepository = createPasswordRecoveryRateRepository(other);
  for (let n = 0; n < 20; n++) { assert.equal((await ipRepository.take({
    emailHmac: identify.email(`user${n}@example.com`), ipHmac: shared })).allowed, true);
    other.state.now = new Date(other.state.now.getTime() + 60000); }
  assert.equal((await ipRepository.take({ emailHmac: identify.email('blocked@example.com'), ipHmac: shared })).allowed, false);
  other.state.now = new Date('2026-01-01T01:20:00Z');
  assert.equal((await ipRepository.take({ emailHmac: identify.email('reset@example.com'), ipHmac: shared })).allowed, true);
});

test('concurrent requests serialize and reserve at most one admission during cooldown', async () => {
  const database = memoryDatabase(), identify = createPasswordRecoveryRateIdentifiers(key());
  const repository = createPasswordRecoveryRateRepository(database), input = {
    emailHmac: identify.email('same@example.com'), ipHmac: identify.ip('203.0.113.1') };
  const results = await Promise.all(Array.from({ length: 10 }, () => repository.take(input)));
  assert.equal(results.filter(result => result.allowed).length, 1);
  assert.equal(results.filter(result => !result.allowed).length, 9);
  assert.equal([...database.state.rows.values()].find(row => row.scope === 'EMAIL').admissions, 1);
});

test('expired pseudonymous limits are cleaned after retention in bounded batches', async () => {
  const database = memoryDatabase(), identify = createPasswordRecoveryRateIdentifiers(key());
  const repository = createPasswordRecoveryRateRepository(database);
  await repository.take({ emailHmac: identify.email('cleanup@example.com'), ipHmac: identify.ip('203.0.113.2') });
  database.state.now = new Date('2026-01-02T02:00:00Z');
  assert.equal(await repository.cleanupExpired(database.state.now), 2);
  assert.equal(database.state.rows.size, 0);
});
