import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';

const version = '001_auth_foundation';
const allowedSchemas = new Set(['skillswap_ai', 'skillswap_ai_test_auth']);
const expectedTables = ['schema_migrations', 'careers', 'career_cycles', 'users',
  'student_profiles', 'email_verifications', 'auth_sessions', 'credit_transactions'].sort();

function ensure(condition, code) {
  if (!condition) throw Object.assign(new Error('Migration safety check failed'), { code });
}

export function migrationConfiguration(env, apply = false) {
  const database = env.MIGRATION_DB;
  ensure(typeof database === 'string' && database.length <= 64 &&
    allowedSchemas.has(database), 'MIGRATION_TARGET_INVALID');
  ensure(!env.MIGRATION_HOST || env.MIGRATION_HOST === '127.0.0.1', 'MIGRATION_HOST_INVALID');
  ensure(!env.MIGRATION_PORT || env.MIGRATION_PORT === '3306', 'MIGRATION_PORT_INVALID');
  ensure(typeof env.MIGRATION_USER === 'string' && env.MIGRATION_USER.trim() &&
    env.MIGRATION_USER !== 'skillswap_app', 'MIGRATION_ACCOUNT_REQUIRED');
  ensure(typeof env.MIGRATION_PASSWORD === 'string' && env.MIGRATION_PASSWORD.length > 0,
    'MIGRATION_SECRET_REQUIRED');
  if (apply) ensure(env.MIGRATION_ALLOW_DDL === 'yes', 'MIGRATION_DDL_NOT_AUTHORIZED');
  return { host: '127.0.0.1', port: 3306, database, user: env.MIGRATION_USER,
    password: env.MIGRATION_PASSWORD, multipleStatements: false,
    connectTimeout: 5000, timezone: 'Z', dateStrings: true };
}

export async function readMigration() {
  const bytes = await readFile(new URL('./migrations/001_auth_foundation.sql', import.meta.url));
  const sql = bytes.toString('utf8');
  // Deliberately supports only this reviewed SQL format: no procedures, delimiters,
  // block comments or semicolons inside literals. Do not use as a generic SQL parser.
  const statements = sql.replace(/^\s*--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
  ensure(statements.length === expectedTables.length + 3, 'MIGRATION_FORMAT_INVALID');
  ensure(statements.every((s) => /^(SET SESSION |CREATE TABLE |INSERT INTO schema_migrations )/.test(s)),
    'MIGRATION_FORMAT_INVALID');
  ensure(statements.at(-1) === 'INSERT INTO schema_migrations (version, checksum)\nVALUES (@skillswap_migration_version, @skillswap_migration_checksum)', 'MIGRATION_HISTORY_INVALID');
  const created = statements.filter((s) => s.startsWith('CREATE TABLE '));
  ensure(JSON.stringify(created.map((s) => s.match(/^CREATE TABLE ([a-z_]+) /)?.[1]).sort()) ===
    JSON.stringify(expectedTables), 'MIGRATION_TABLES_INVALID');
  return { version, checksum: createHash('sha256').update(bytes).digest('hex'), statements };
}

export async function executeMigrationStatements(connection, statements) {
  // A failed statement must prevent the final completion record from running.
  for (const statement of statements) await connection.query(statement);
}

// Conservative parser for direct SHOW GRANTS output, not arbitrary GRANT SQL.
// Never infer minimum privileges from global rights, roles or wildcard scopes.
export function checkMigrationPrivileges(rows, database, partialRevokes, { requireUpdate = false } = {}) {
  ensure(allowedSchemas.has(database), 'MIGRATION_TARGET_INVALID');
  ensure([0, 1, '0', '1'].includes(partialRevokes), 'MIGRATION_PRIVILEGE_MODE_UNKNOWN');
  ensure(Array.isArray(rows) && rows.length > 0, 'MIGRATION_PRIVILEGES_MISSING');
  const literalMode = Number(partialRevokes) === 1;
  const targetPrivileges = new Set();
  for (const row of rows) {
    const values = Object.values(row);
    ensure(values.length === 1 && typeof values[0] === 'string', 'MIGRATION_GRANT_AMBIGUOUS');
    const match = values[0].match(/^GRANT ([A-Z_, ]+) ON (\*\.\*|`(?:``|[^`])+`\.\*) TO `(?:``|[^`])+`@`(?:``|[^`])+`$/);
    ensure(match, 'MIGRATION_GRANT_AMBIGUOUS');
    const privileges = match[1].split(', ');
    if (match[2] === '*.*') {
      ensure(privileges.length === 1 && privileges[0] === 'USAGE', 'MIGRATION_GLOBAL_PRIVILEGES_REJECTED');
      continue;
    }
    const encoded = match[2].slice(1, -3).replaceAll('``', '`');
    let schema = '';
    for (let index = 0; index < encoded.length; index++) {
      const char = encoded[index];
      if (char === '\\') {
        // With partial_revokes ON, backslashes are not interpreted as a
        // wildcard escape here; reject that representation rather than guess.
        ensure(!literalMode && ['_', '%'].includes(encoded[index + 1]), 'MIGRATION_GRANT_AMBIGUOUS');
        schema += encoded[++index];
      } else {
        ensure(literalMode || !['_', '%'].includes(char), 'MIGRATION_WILDCARD_PRIVILEGES_REJECTED');
        schema += char;
      }
    }
    ensure(allowedSchemas.has(schema), 'MIGRATION_SCHEMA_PRIVILEGES_REJECTED');
    const allowed = new Set(['CREATE', 'REFERENCES', 'SELECT', 'INSERT']);
    if (schema === 'skillswap_ai_test_auth') allowed.add('UPDATE');
    ensure(privileges.every((privilege) => allowed.has(privilege)), 'MIGRATION_EXCESS_PRIVILEGES_REJECTED');
    if (schema === database) for (const privilege of privileges) targetPrivileges.add(privilege);
  }
  const required = ['CREATE', 'REFERENCES', 'SELECT', 'INSERT'];
  if (requireUpdate) required.push('UPDATE');
  ensure(required.every((privilege) => targetPrivileges.has(privilege)), 'MIGRATION_PRIVILEGES_MISSING');
}

async function inspect(connection, config, migration) {
  const [[instance]] = await connection.query(
    'SELECT VERSION() AS version, DATABASE() AS db, @@port AS port, CURRENT_USER() AS account, @@GLOBAL.partial_revokes AS partialRevokes');
  ensure(/^8\.4\./.test(instance.version) && instance.db === config.database && instance.port === 3306,
    'MIGRATION_INSTANCE_INVALID');
  const account = instance.account.slice(0, instance.account.lastIndexOf('@'));
  ensure(account === config.user && account !== 'skillswap_app', 'MIGRATION_IDENTITY_INVALID');
  const [grants] = await connection.query('SHOW GRANTS FOR CURRENT_USER()');
  checkMigrationPrivileges(grants, config.database, instance.partialRevokes);
  const [objects] = await connection.execute(
    'SELECT TABLE_NAME AS name, TABLE_TYPE AS type, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
    [config.database]);
  // Even a routine/event in an otherwise empty schema needs explicit review.
  const [[other]] = await connection.execute(
    'SELECT (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?) + (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ?) AS count',
    [config.database, config.database]);
  ensure(Number(other.count) === 0, 'MIGRATION_UNEXPECTED_OBJECTS');
  if (!objects.length) return 'pending';
  ensure(JSON.stringify(objects.map((o) => o.name).sort()) === JSON.stringify(expectedTables) &&
    objects.every((o) => o.type === 'BASE TABLE' && o.engine === 'InnoDB'), 'MIGRATION_PARTIAL_OR_FOREIGN_SCHEMA');
  const [history] = await connection.query('SELECT version, checksum FROM schema_migrations ORDER BY version');
  ensure(history.length === 1 && history[0].version === migration.version &&
    history[0].checksum === migration.checksum, 'MIGRATION_HISTORY_MISMATCH');
  await checkStructure(connection, config.database, migration);
  return 'applied';
}

async function checkStructure(connection, database, migration) {
  const [columns] = await connection.execute(
    'SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION', [database]);
  const [constraints] = await connection.execute(
    'SELECT TABLE_NAME AS t, CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ?', [database]);
  const [checks] = await connection.execute(
    "SELECT CONSTRAINT_NAME AS name, ENFORCED AS enforced FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ? AND CONSTRAINT_TYPE = 'CHECK'", [database]);
  ensure(checks.every((c) => c.enforced === 'YES'), 'MIGRATION_CHECK_DISABLED');
  for (const statement of migration.statements.filter((s) => s.startsWith('CREATE TABLE '))) {
    const table = statement.match(/^CREATE TABLE ([a-z_]+) /)[1];
    const expected = [...statement.matchAll(/^  ([a-z_]+) (CHAR\(\d+\)|VARCHAR\(\d+\)|VARBINARY\(\d+\)|DATETIME\(6\)|SMALLINT UNSIGNED|INT|BOOLEAN)/gm)];
    const actual = columns.filter((c) => c.t === table);
    ensure(actual.length === expected.length, 'MIGRATION_COLUMNS_MISMATCH');
    expected.forEach((match, index) => {
      const type = match[2].toLowerCase().replace('boolean', 'tinyint(1)');
      ensure(actual[index].c === match[1] && actual[index].type.toLowerCase() === type,
        'MIGRATION_COLUMNS_MISMATCH');
    });
    const names = ['PRIMARY', ...[...statement.matchAll(/(?:CONSTRAINT|UNIQUE KEY) ([a-z_]+)/g)].map((m) => m[1])].sort();
    const actualNames = constraints.filter((c) => c.t === table).map((c) => c.name).sort();
    ensure(JSON.stringify(names) === JSON.stringify(actualNames), 'MIGRATION_CONSTRAINTS_MISMATCH');
  }
  // This detects basic structural drift, not arbitrary edits to CHECK expressions,
  // defaults or index definitions under unchanged names. Never claim full equivalence.
}

export async function runMigration(connection, config, {
  apply = false, allowDdl = false, validatedChecksum,
} = {}) {
  ensure(config.host === '127.0.0.1' && config.port === 3306 && config.user !== 'skillswap_app' &&
    typeof config.database === 'string' && config.database.length <= 64 &&
    allowedSchemas.has(config.database), 'MIGRATION_TARGET_INVALID');
  const migration = await readMigration();
  if (apply) {
    ensure(allowDdl === true, 'MIGRATION_DDL_NOT_AUTHORIZED');
    if (config.database === 'skillswap_ai') {
      // Operator attestation after isolated validation; not proof of a test run.
      ensure(validatedChecksum === migration.checksum, 'MIGRATION_ISOLATED_VALIDATION_REQUIRED');
    }
  }
  if (!apply) return { state: await inspect(connection, config, migration), checksum: migration.checksum, applied: false };
  const lockName = `skillswap-migrations:${createHash('sha256').update(config.database).digest('hex').slice(0, 32)}`;
  const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 5) AS acquired', [lockName]);
  ensure(lock.acquired === 1, 'MIGRATION_LOCK_UNAVAILABLE');
  try {
    // Reinspect after acquiring the lock: no time-of-check/time-of-use gap.
    const state = await inspect(connection, config, migration);
    if (state === 'applied') return { state, checksum: migration.checksum, applied: false };
    await connection.execute('SET @skillswap_migration_version = ?, @skillswap_migration_checksum = ?',
      [migration.version, migration.checksum]);
    await executeMigrationStatements(connection, migration.statements);
    ensure(await inspect(connection, config, migration) === 'applied', 'MIGRATION_POSTCHECK_FAILED');
    return { state: 'applied', checksum: migration.checksum, applied: true };
  } finally {
    await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]);
  }
}

const direct = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  let connection;
  try {
    const args = process.argv.slice(2);
    ensure(args.length === 0 || (args.length === 1 && ['--check', '--apply'].includes(args[0])), 'MIGRATION_ARGUMENT_INVALID');
    const apply = args[0] === '--apply';
    // Deliberately no dotenv or DB_* fallback: migration identity is separate.
    const config = migrationConfiguration(process.env, apply);
    connection = await mysql.createConnection(config);
    const result = await runMigration(connection, config, {
      apply, allowDdl: process.env.MIGRATION_ALLOW_DDL === 'yes',
      validatedChecksum: process.env.MIGRATION_VALIDATED_CHECKSUM,
    });
    console.info(JSON.stringify(result));
  } catch (error) {
    const code = /^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'MIGRATION_FAILED';
    console.error(`Migration stopped (${code}). Review local configuration/state; no automatic cleanup.`);
    process.exitCode = 1;
  } finally {
    try { await connection?.end(); } catch {
      console.error('Migration connection could not close cleanly.');
      process.exitCode = 1;
    }
  }
}
