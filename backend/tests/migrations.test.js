import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID, randomBytes, scryptSync } from 'node:crypto';
import mysql from 'mysql2/promise';
import { migrationConfiguration, runMigration, executeMigrationStatements, checkMigrationPrivileges, latestMigration, readMigrations } from '../database/migrate.js';

const version = '001_auth_foundation';
const bytes = await readFile(new URL('../database/migrations/001_auth_foundation.sql', import.meta.url));
const checksum = createHash('sha256').update(bytes).digest('hex');
const sql = bytes.toString('utf8');
// This migration contains only single statements, no procedures or quoted semicolons.
const statements = sql.replace(/^\s*--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
const tables = ['schema_migrations', 'careers', 'career_cycles', 'users', 'student_profiles',
  'email_verifications', 'auth_sessions', 'credit_transactions'].sort();

function testConfiguration(env) {
  const database = env.MIGRATION_TEST_DB;
  assert.equal(database, 'skillswap_ai_test_auth');
  assert.ok(database.length <= 64);
  assert.equal(env.MIGRATION_TEST_ALLOW_DDL, 'yes');
  assert.ok(env.MIGRATION_TEST_USER && env.MIGRATION_TEST_USER !== 'skillswap_app');
  assert.ok(env.MIGRATION_TEST_PASSWORD);
  return {
    host: '127.0.0.1', port: 3306, database,
    user: env.MIGRATION_TEST_USER, password: env.MIGRATION_TEST_PASSWORD,
    multipleStatements: false, connectTimeout: 5000, timezone: 'Z', dateStrings: true,
  };
}

test('migration contains only expected additive DDL, UTC configuration and final technical history', () => {
  const created = [...sql.matchAll(/^CREATE TABLE ([a-z_]+) \(/gm)].map((m) => m[1]).sort();
  assert.deepEqual(created, tables);
  assert.equal(statements.length, tables.length + 3);
  assert.ok(statements.every((s) => /^(SET SESSION |CREATE TABLE |INSERT INTO schema_migrations )/.test(s)));
  assert.match(statements.at(-1), /^INSERT INTO schema_migrations/);
  assert.equal(statements.filter((s) => /^INSERT /i.test(s)).length, 1);
  assert.equal((sql.match(/ENGINE=InnoDB/g) ?? []).length, tables.length);
  assert.match(sql, /SET SESSION time_zone = '\+00:00'/);
});

test('executor stops on failed DDL without executing the completion record', async () => {
  const seen = [];
  const failure = new Error('DDL failed');
  const connection = { async query(command) {
    seen.push(command);
    if (command.startsWith('CREATE TABLE users')) throw failure;
  } };
  await assert.rejects(executeMigrationStatements(connection, statements), (error) => error === failure);
  assert.ok(!seen.some((s) => s.startsWith('INSERT INTO schema_migrations')));
});

test('isolated integration configuration cannot target application schema or application user', () => {
  const valid = { MIGRATION_TEST_DB: 'skillswap_ai_test_auth', MIGRATION_TEST_USER: 'isolated_migrator',
    MIGRATION_TEST_PASSWORD: randomBytes(32).toString('hex'), MIGRATION_TEST_ALLOW_DDL: 'yes' };
  assert.equal(testConfiguration(valid).host, '127.0.0.1');
  for (const patch of [ { MIGRATION_TEST_DB: 'skillswap_ai' }, { MIGRATION_TEST_DB: 'other_db' },
    { MIGRATION_TEST_DB: 'skillswap_ai_test_bad`name' }, { MIGRATION_TEST_ALLOW_DDL: 'no' },
    { MIGRATION_TEST_USER: 'skillswap_app' }, { MIGRATION_TEST_PASSWORD: '' } ]) {
    assert.throws(() => testConfiguration({ ...valid, ...patch }));
  }
});

test('migration configuration requires separate credentials and explicit DDL authorization', () => {
  const valid = { MIGRATION_DB: 'skillswap_ai_test_auth', MIGRATION_USER: 'isolated_migrator',
    MIGRATION_PASSWORD: randomBytes(32).toString('hex') };
  assert.equal(migrationConfiguration(valid).database, valid.MIGRATION_DB);
  for (const patch of [{ MIGRATION_USER: 'skillswap_app' }, { MIGRATION_PASSWORD: '' },
    { MIGRATION_DB: 'unrelated' }, { MIGRATION_HOST: 'remote.example' }, { MIGRATION_PORT: '3307' }]) {
    assert.throws(() => migrationConfiguration({ ...valid, ...patch }));
  }
  assert.throws(() => migrationConfiguration(valid, true));
  assert.equal(migrationConfiguration({ ...valid, MIGRATION_ALLOW_DDL: 'yes' }, true).multipleStatements, false);
});

function fakeConnection() {
  const commands = [];
  return { commands,
    async query(command) {
      commands.push(command);
      if (command.startsWith('SELECT VERSION()')) return [[{
        version: '8.4.13', db: 'skillswap_ai_test_auth', port: 3306, account: 'isolated_migrator@localhost', partialRevokes: 0,
      }]];
      if (command.startsWith('SHOW GRANTS')) return [[{
        grant: 'GRANT SELECT, INSERT, CREATE, REFERENCES ON `skillswap\\_ai\\_test\\_auth`.* TO `isolated_migrator`@`localhost`',
      }]];
      if (command.startsWith('CREATE TABLE users')) throw Object.assign(new Error('synthetic failure'), { code: 'ER_TEST_DDL' });
      return [[]];
    },
    async execute(command) {
      commands.push(command);
      if (command.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (command.includes('information_schema.TABLES')) return [[]];
      if (command.includes('information_schema.ROUTINES')) return [[{ count: 0 }]];
      return [[]];
    },
  };
}
const fakeConfig = { host: '127.0.0.1', port: 3306, database: 'skillswap_ai_test_auth', user: 'isolated_migrator' };

test('runner defaults to read-only inspection without DDL or history writes', async () => {
  const connection = fakeConnection();
  const result = await runMigration(connection, fakeConfig);
  assert.equal(result.state, 'pending');
  assert.equal(result.applied, false);
  assert.equal(result.checksum, checksum);
  assert.ok(connection.commands.every((s) => /^(SELECT|SHOW) /.test(s)));
});

test('application and demo migrations require isolated-validation checksums before any connection operation', async () => {
  const connection = fakeConnection();
  for (const database of ['skillswap_ai', 'skillswap_ai_demo']) await assert.rejects(
    runMigration(connection, { ...fakeConfig, database }, { apply: true, allowDdl: true }),
    (error) => error.code === 'MIGRATION_ISOLATED_VALIDATION_REQUIRED');
  await assert.rejects(runMigration(connection, fakeConfig, { apply: true }),
    (error) => error.code === 'MIGRATION_DDL_NOT_AUTHORIZED');
  assert.equal(connection.commands.length, 0);
});

test('runner releases advisory lock on DDL failure and never records completion', async () => {
  const connection = fakeConnection();
  await assert.rejects(runMigration(connection, fakeConfig, { apply: true, allowDdl: true }),
    (error) => error.code === 'ER_TEST_DDL');
  assert.ok(connection.commands.some((s) => s.includes('GET_LOCK')));
  assert.ok(connection.commands.at(-1).includes('RELEASE_LOCK'));
  assert.ok(!connection.commands.some((s) => s.startsWith('INSERT INTO schema_migrations')));
});

test('unsafe identity, missing grants and unavailable lock prevent DDL', async () => {
  for (const [kind, expectedCode] of [['identity', 'MIGRATION_IDENTITY_INVALID'],
    ['privileges', 'MIGRATION_PRIVILEGES_MISSING'], ['lock', 'MIGRATION_LOCK_UNAVAILABLE']]) {
    const connection = fakeConnection();
    const query = connection.query.bind(connection);
    connection.query = async (command) => {
      if (kind === 'identity' && command.startsWith('SELECT VERSION()')) {
        return [[{ version: '8.4.13', db: fakeConfig.database, port: 3306, account: 'skillswap_app@localhost' }]];
      }
      if (kind === 'privileges' && command.startsWith('SHOW GRANTS')) return [[{ grant: 'GRANT USAGE ON *.* TO `isolated_migrator`@`localhost`' }]];
      return query(command);
    };
    const execute = connection.execute.bind(connection);
    connection.execute = async (command, params) => kind === 'lock' && command.includes('GET_LOCK')
      ? [[{ acquired: 0 }]] : execute(command, params);
    await assert.rejects(runMigration(connection, fakeConfig, { apply: true, allowDdl: true }),
      (error) => error.code === expectedCode);
    assert.ok(!connection.commands.some((command) => command.startsWith('CREATE TABLE')));
  }
});

test('only application, exact isolated test and exact local demo schemas are accepted', async () => {
  const base = { MIGRATION_USER: 'isolated_migrator', MIGRATION_PASSWORD: randomBytes(32).toString('hex') };
  for (const database of ['skillswap_ai', 'skillswap_ai_test_auth', 'skillswap_ai_demo']) {
    assert.equal(migrationConfiguration({ ...base, MIGRATION_DB: database }).database, database);
  }
  for (const user of ['skillswap_app', 'skillswap_test_app', 'skillswap_demo_app']) {
    assert.throws(() => migrationConfiguration({ ...base, MIGRATION_DB: 'skillswap_ai_demo', MIGRATION_USER: user }),
      (error) => error.code === 'MIGRATION_ACCOUNT_REQUIRED');
  }
  for (const database of ['skillswap_ai_test', 'skillswap_ai_test_other', 'skillswap_ai_test_auth_extra',
    'skillswap_ai_demo_extra', 'skillswap_ai_demo ', 'SKILLSWAP_AI_DEMO',
    'skillswap_ai_test_auth ', 'SKILLSWAP_AI_TEST_AUTH', 'mysql', '', 'skillswap_ai_test_%']) {
    assert.throws(() => migrationConfiguration({ ...base, MIGRATION_DB: database }),
      (error) => error.code === 'MIGRATION_TARGET_INVALID');
    const connection = fakeConnection();
    await assert.rejects(runMigration(connection, { ...fakeConfig, database }),
      (error) => error.code === 'MIGRATION_TARGET_INVALID');
    assert.equal(connection.commands.length, 0);
  }
});

const grantee = '`isolated_migrator`@`localhost`';
const minimum = 'SELECT, INSERT, CREATE, REFERENCES';
const escapedTestScope = '`skillswap\\_ai\\_test\\_auth`.*';
const escapedAppScope = '`skillswap\\_ai`.*';
const escapedDemoScope = '`skillswap\\_ai\\_demo`.*';
const grant = (privileges = minimum, scope = escapedTestScope) => ({
  grant: `GRANT ${privileges} ON ${scope} TO ${grantee}`,
});

test('escaped literal schema grants with partial_revokes OFF and literal grants with ON', () => {
  for (const mode of [0, '0']) {
    checkMigrationPrivileges([grant(), grant('USAGE', '*.*')], fakeConfig.database, mode);
    checkMigrationPrivileges([grant(minimum, escapedAppScope)], 'skillswap_ai', mode);
    checkMigrationPrivileges([grant(minimum, escapedDemoScope)], 'skillswap_ai_demo', mode);
  }
  for (const mode of [1, '1']) {
    checkMigrationPrivileges([grant(minimum, '`skillswap_ai_test_auth`.*')], fakeConfig.database, mode);
    checkMigrationPrivileges([grant(minimum, '`skillswap_ai`.*')], 'skillswap_ai', mode);
    checkMigrationPrivileges([grant(minimum, '`skillswap_ai_demo`.*')], 'skillswap_ai_demo', mode);
  }
  checkMigrationPrivileges([grant('SELECT, CREATE'), grant('INSERT, REFERENCES, UPDATE')],
    fakeConfig.database, 0, { requireUpdate: true });
  assert.throws(() => checkMigrationPrivileges([grant()], fakeConfig.database, 0, { requireUpdate: true }),
    (error) => error.code === 'MIGRATION_PRIVILEGES_MISSING');
});

test('global or excessive privileges never substitute for exact minimum schema grants', () => {
  const rejected = [grant('ALL PRIVILEGES'), grant('ALL PRIVILEGES', '*.*'), grant(minimum, '*.*'),
    grant('CREATE USER', '*.*'), grant(minimum + ', DROP'), grant(minimum + ', ALTER'),
    grant(minimum + ', DELETE'), grant(minimum + ', GRANT OPTION')];
  for (const row of rejected) {
    assert.throws(() => checkMigrationPrivileges([grant(), row], fakeConfig.database, 0));
  }
  assert.throws(() => checkMigrationPrivileges([grant(minimum + ', UPDATE', escapedAppScope)], 'skillswap_ai', 0));
  assert.throws(() => checkMigrationPrivileges([grant(minimum, escapedAppScope)], fakeConfig.database, 0),
    (error) => error.code === 'MIGRATION_PRIVILEGES_MISSING');
});

test('wildcards, unknown modes, roles, grant options and unsupported syntax fail closed', () => {
  const invalidScopes = ['`skillswap_ai_test_auth`.*', '`skillswap\\_ai\\_test\\_%`.*',
    '`skillswap\\_ai\\_test\\_aut_`.*', '`other`.*', '`skillswap\\_ai\\_test\\_other`.*',
    '`skillswap\\qai`.*', '`skillswap\\_ai\\_test\\_auth`.users'];
  for (const scope of invalidScopes) {
    assert.throws(() => checkMigrationPrivileges([grant(minimum, scope)], fakeConfig.database, 0));
  }
  for (const mode of [undefined, null, 2, 'OFF', 'ON']) {
    assert.throws(() => checkMigrationPrivileges([grant()], fakeConfig.database, mode),
      (error) => error.code === 'MIGRATION_PRIVILEGE_MODE_UNKNOWN');
  }
  assert.throws(() => checkMigrationPrivileges([grant()], fakeConfig.database, 1));
  const unsupported = [
    `GRANT ${minimum} ON ${escapedTestScope} TO ${grantee} WITH GRANT OPTION`,
    `GRANT ${grantee} TO ${grantee}`,
    `REVOKE SELECT ON ${escapedTestScope} FROM ${grantee}`,
    'GRANT PROXY ON x TO y', 'unexpected output',
  ];
  for (const value of unsupported) {
    assert.throws(() => checkMigrationPrivileges([grant(), { grant: value }], fakeConfig.database, 0));
  }
});

test('runner reads partial_revokes and rejects broad grants before any DDL', async () => {
  for (const mode of [0, undefined]) {
    const connection = fakeConnection();
    const query = connection.query.bind(connection);
    connection.query = async (command) => {
      if (command.startsWith('SELECT VERSION()')) {
        assert.ok(command.includes('@@GLOBAL.partial_revokes'));
        return [[{ version: '8.4.13', db: fakeConfig.database, port: 3306,
          account: 'isolated_migrator@localhost', partialRevokes: mode }]];
      }
      if (command.startsWith('SHOW GRANTS')) return [[grant(minimum, '*.*')]];
      return query(command);
    };
    await assert.rejects(runMigration(connection, fakeConfig, { apply: true, allowDdl: true }));
    assert.ok(!connection.commands.some((s) => s.startsWith('CREATE TABLE')));
  }
});

const integrationRequested = Object.keys(process.env).some((key) => key.startsWith('MIGRATION_TEST_'));
test('MySQL 8.4 isolated schema: migration, metadata, constraints and rollback-only fixtures', {
  skip: integrationRequested ? false : 'No authorized migration account/test schema configured; real DDL validation pending',
  timeout: 60000,
}, async (t) => {
  // Read only explicit integration variables; never fall back to application DB credentials.
  const config = testConfiguration(process.env);
  const latestTables = [...tables, 'otp_request_limits', 'login_rate_limits',
    'password_recovery_limits', 'password_recovery_challenges', 'student_interests',
    'student_profile_details', 'mentor_application_documents', 'mentor_application_events',
    'mentor_applications', 'private_files', 'skill_catalog', 'student_profile_photos', 'student_skills',
    'mentor_availability', 'mentor_offers', 'mentoring_session_events', 'mentoring_sessions',
    'session_credit_holds', 'session_reviews', 'mentor_skill_levels', 'skill_level_catalog'].sort();
  let connection;
  try {
    connection = await mysql.createConnection(config);
    const [[instance]] = await connection.query('SELECT VERSION() AS version, DATABASE() AS db, @@port AS port, @@GLOBAL.partial_revokes AS partialRevokes');
    assert.match(instance.version, /^8\.4\./);
    assert.equal(instance.db, config.database);
    assert.equal(instance.port, 3306);
    const [grants] = await connection.query('SHOW GRANTS FOR CURRENT_USER()');
    checkMigrationPrivileges(grants, config.database, instance.partialRevokes, { requireUpdate: true, requireAlter: true });
    await runMigration(connection, config, { apply: true, allowDdl: true, through: latestMigration });
    assert.equal((await runMigration(connection, config, { apply: true, allowDdl: true, through: latestMigration })).applied, false, 'Reapplication must be a verified no-op');

    const [metadata] = await connection.execute(
      'SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [config.database]);
    assert.deepEqual(metadata.map((r) => r.name).sort(), latestTables);
    assert.ok(metadata.every((r) => r.engine === 'InnoDB'));
    for (const table of latestTables.filter((name) => name !== 'schema_migrations')) {
      const [[row]] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
      assert.equal(row.count, 0, 'Test schema must contain no business data before fixtures');
    }
    const [columns] = await connection.execute(
      'SELECT TABLE_NAME AS t, COLUMN_NAME AS c, DATA_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?', [config.database]);
    assert.equal(columns.find((c) => c.t === 'credit_transactions' && c.c === 'amount').type, 'int');
    assert.equal(columns.find((c) => c.t === 'users' && c.c === 'created_at').type, 'datetime');
    assert.equal(columns.find((c) => c.t === 'email_verifications' && c.c === 'code_hmac').type, 'varbinary');
    assert.equal(columns.find((c) => c.t === 'login_rate_limits' && c.c === 'identifier_hmac').type, 'varbinary');
    assert.equal(columns.find((c) => c.t === 'password_recovery_limits' && c.c === 'identifier_hmac').type, 'varbinary');
    assert.equal(columns.find((c) => c.t === 'password_recovery_challenges' && c.c === 'code_hmac').type, 'varbinary');
    assert.ok(!columns.some((column) =>
      (column.t === 'users' && ['password', 'confirm_password'].includes(column.c)) ||
      (column.t === 'email_verifications' && column.c === 'code')));
    const [constraints] = await connection.execute(
      'SELECT CONSTRAINT_TYPE AS type FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ?', [config.database]);
    assert.equal(constraints.filter((r) => r.type === 'PRIMARY KEY').length, latestTables.length);
    assert.ok(constraints.filter((r) => r.type === 'FOREIGN KEY').length >= 38);
    assert.ok(constraints.filter((r) => r.type === 'CHECK').length >= 57);
    const [indexes] = await connection.execute(
      "SELECT INDEX_NAME AS name,COLUMN_NAME AS column_name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME='login_rate_limits'", [config.database]);
    assert.ok(indexes.some(index=>index.name==='ix_login_rate_expiry'&&index.column_name==='expires_at'));
    await connection.beginTransaction();
    try {
      const career = randomUUID();
      const user = randomUUID();
      const other = randomUUID();
      const challenge = randomUUID();
      const now = '2026-01-01 00:00:00.000000';
      const future = '2026-01-01 00:10:00.000000';
      // Synthetic fixtures, generated IDs/hashes; never seed or persist real accounts.
      const passwordHash = `$scrypt$${randomBytes(16).toString('hex')}$${scryptSync(randomBytes(32), randomBytes(16), 32).toString('hex')}`;
      const email = `test.${randomBytes(8).toString('hex')}@tecsup.edu.pe`;
      const insertUser = (id, address, role = 'STUDENT', status = 'PENDING_VERIFICATION') => connection.execute(
        'INSERT INTO users (id, first_name, last_name, email, password_hash, role, status, terms_accepted_at, terms_version, privacy_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, 'Prueba', 'Aislada', address, passwordHash, role, status, now, 'test-only', 'test-only', now]);
      await connection.execute('INSERT INTO careers (id, code, name) VALUES (?, ?, ?)', [career, 'TEST_ONLY', 'Catalogo sintetico de prueba']);
      await connection.execute('INSERT INTO career_cycles (career_id, cycle) VALUES (?, ?)', [career, 3]);
      await insertUser(user, email);
      await insertUser(other, `other.${randomBytes(8).toString('hex')}@tecsup.edu.pe`);
      await connection.execute('INSERT INTO student_profiles (user_id, career_id, cycle) VALUES (?, ?, ?)', [user, career, 3]);
      const rejects = (operation, code) => assert.rejects(operation, (error) => error.code === code);

      await t.test('primary keys, unique email and normalized institutional address', async () => {
        await rejects(insertUser(user, `another.${randomBytes(8).toString('hex')}@tecsup.edu.pe`), 'ER_DUP_ENTRY');
        await rejects(insertUser(randomUUID(), email), 'ER_DUP_ENTRY');
        for (const bad of ['nombre@tecsup.edu.pe', 'nombre.apellido+tag@tecsup.edu.pe',
          'nombre.apellido@sub.tecsup.edu.pe', 'nombre.apellido@demo.pe', email.toUpperCase(), ` ${email}`]) {
          await rejects(insertUser(randomUUID(), bad), 'ER_CHECK_CONSTRAINT_VIOLATED');
        }
      });
      await t.test('role and verification state constraints', async () => {
        await rejects(insertUser(randomUUID(), `role.${randomBytes(8).toString('hex')}@tecsup.edu.pe`, 'MENTOR'), 'ER_CHECK_CONSTRAINT_VIOLATED');
        await rejects(insertUser(randomUUID(), `active.${randomBytes(8).toString('hex')}@tecsup.edu.pe`, 'STUDENT', 'ACTIVE'), 'ER_CHECK_CONSTRAINT_VIOLATED');
      });
      await t.test('profile owner and authorized career/cycle', async () => {
        await rejects(connection.execute('INSERT INTO student_profiles (user_id, career_id, cycle) VALUES (?, ?, ?)', [randomUUID(), career, 3]), 'ER_NO_REFERENCED_ROW_2');
        await rejects(connection.execute('INSERT INTO student_profiles (user_id, career_id, cycle) VALUES (?, ?, ?)', [other, career, 2]), 'ER_NO_REFERENCED_ROW_2');
        const admin = randomUUID();
        await insertUser(admin, `admin.${randomBytes(8).toString('hex')}@example.invalid`, 'ADMIN');
        await rejects(connection.execute('INSERT INTO student_profiles (user_id, career_id, cycle) VALUES (?, ?, ?)', [admin, career, 3]), 'ER_NO_REFERENCED_ROW_2');
      });
      await connection.execute('INSERT INTO email_verifications (id, user_id, code_hmac, hmac_key_version, max_attempts, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [challenge, user, randomBytes(32), 'test-only', 5, future, now]);
      await t.test('verification expiry, attempts and consumption consistency', async () => {
        await rejects(connection.execute('UPDATE email_verifications SET attempts = 6 WHERE id = ?', [challenge]), 'ER_CHECK_CONSTRAINT_VIOLATED');
        await rejects(connection.execute('UPDATE email_verifications SET expires_at = created_at WHERE id = ?', [challenge]), 'ER_CHECK_CONSTRAINT_VIOLATED');
        await rejects(connection.execute("UPDATE email_verifications SET status = 'CONSUMED' WHERE id = ?", [challenge]), 'ER_CHECK_CONSTRAINT_VIOLATED');
      });
      await connection.execute("UPDATE email_verifications SET status = 'CONSUMED', consumed_at = ? WHERE id = ?", [now, challenge]);
      await connection.execute("UPDATE users SET email_verified_at = ?, status = 'ACTIVE' WHERE id = ?", [now, user]);
      const initial = (id, owner, reference, amount = 20) => connection.execute(
        'INSERT INTO credit_transactions (id, user_id, amount, reason, operation_reference, verification_id) VALUES (?, ?, ?, ?, ?, ?)',
        [id, owner, amount, 'INITIAL_EMAIL_VERIFICATION', reference, challenge]);
      await t.test('initial grant is exactly 20, unique per user and linked to own verification', async () => {
        await rejects(initial(randomUUID(), user, randomUUID(), 19), 'ER_CHECK_CONSTRAINT_VIOLATED');
        await rejects(initial(randomUUID(), other, randomUUID()), 'ER_NO_REFERENCED_ROW_2');
        await initial(randomUUID(), user, 'initial:test-only');
        await rejects(initial(randomUUID(), user, 'initial:another-reference'), 'ER_DUP_ENTRY');
        await rejects(connection.execute('INSERT INTO credit_transactions (id, user_id, amount, reason, operation_reference) VALUES (?, ?, ?, ?, ?)',
          [randomUUID(), other, 1, 'TEST_ONLY', 'initial:test-only']), 'ER_DUP_ENTRY');
      });
      await t.test('session digests, expiry and revocation dates', async () => {
        const id = randomBytes(32);
        await connection.execute('INSERT INTO auth_sessions (id_hash, user_id, csrf_token_hmac, created_at, last_seen_at, idle_expires_at, absolute_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, user, randomBytes(32), now, now, future, future]);
        await rejects(connection.execute('UPDATE auth_sessions SET idle_expires_at = created_at WHERE id_hash = ?', [id]), 'ER_CHECK_CONSTRAINT_VIOLATED');
        await rejects(connection.execute('UPDATE auth_sessions SET revoked_at = ? WHERE id_hash = ?', ['2025-12-31 23:59:59', id]), 'ER_CHECK_CONSTRAINT_VIOLATED');
        await rejects(connection.execute('UPDATE auth_sessions SET csrf_token_hmac = ? WHERE id_hash = ?', [randomBytes(8), id]), 'ER_CHECK_CONSTRAINT_VIOLATED');
      });
      await t.test('login rate scope, HMAC, counters and fixed window constraints', async () => {
        const identifier = randomBytes(32);
        const expiry = '2026-01-01 00:15:00.000000';
        await connection.execute('INSERT INTO login_rate_limits (scope,identifier_hmac,window_started_at,expires_at,attempts) VALUES (?,?,?,?,?)',
          ['EMAIL', identifier, now, expiry, 5]);
        await rejects(connection.execute('INSERT INTO login_rate_limits (scope,identifier_hmac,window_started_at,expires_at,attempts) VALUES (?,?,?,?,?)',
          ['EMAIL', identifier, now, expiry, 1]), 'ER_DUP_ENTRY');
        for (const values of [['USER', randomBytes(32), now, expiry, 1], ['IP', randomBytes(8), now, expiry, 1],
          ['IP', randomBytes(32), now, expiry, 21], ['IP', randomBytes(32), now, future, 1]]) {
          await rejects(connection.execute('INSERT INTO login_rate_limits (scope,identifier_hmac,window_started_at,expires_at,attempts) VALUES (?,?,?,?,?)', values), 'ER_CHECK_CONSTRAINT_VIOLATED');
        }
      });
    } finally {
      await connection.rollback();
    }
    for (const table of latestTables.filter((name) => name !== 'schema_migrations')) {
      const [[row]] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
      assert.equal(row.count, 0, 'All synthetic fixtures must be rolled back');
    }
    const [history] = await connection.query('SELECT version, checksum FROM schema_migrations');
    assert.deepEqual(history, (await readMigrations(latestMigration)).map(m=>({version:m.version,checksum:m.checksum})));
  } catch (error) {
    // mysql2 errors may contain SQL/bind values; never forward that object to node:test.
    const code = /^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'INTEGRATION_CHECK_FAILED';
    throw new Error(`Isolated MySQL verification failed (${code}); inspect locally without logging credentials or queries`);
  } finally {
    await connection?.end();
  }
});
