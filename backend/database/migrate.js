import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';

const version = '001_auth_foundation';
export const latestMigration = '002_otp_delivery_safety';
const versions = [version, latestMigration];
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

export async function readMigration(selected = version) {
  ensure(versions.includes(selected), 'MIGRATION_VERSION_INVALID');
  const bytes = await readFile(new URL(`./migrations/${selected}.sql`, import.meta.url));
  const statements = bytes.toString('utf8').replace(/^\s*--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
  ensure(statements[0] === "SET SESSION time_zone = '+00:00'" && statements[1] === "SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'", 'MIGRATION_FORMAT_INVALID');
  const history = 'INSERT INTO schema_migrations (version, checksum)\nVALUES (@skillswap_migration_version, @skillswap_migration_checksum)';
  ensure(statements.at(-1) === history, 'MIGRATION_HISTORY_INVALID');
  const created = statements.filter(s => s.startsWith('CREATE TABLE '));
  const tables = selected === version ? expectedTables : ['otp_request_limits'];
  ensure(JSON.stringify(created.map(s => s.match(/^CREATE TABLE ([a-z_]+) /)?.[1]).sort()) === JSON.stringify(tables), 'MIGRATION_TABLES_INVALID');
  const alter = "ALTER TABLE email_verifications\n  DROP CHECK chk_verifications_status,\n  ADD CONSTRAINT chk_verifications_status CHECK (status IN ('SENDING', 'PENDING', 'CONSUMED', 'REVOKED', 'EXPIRED', 'EXHAUSTED')),\n  ALTER COLUMN status SET DEFAULT 'SENDING'";
  ensure(statements.length === (selected === version ? expectedTables.length + 3 : 5), 'MIGRATION_FORMAT_INVALID');
  ensure(statements.every(s => /^(SET SESSION |CREATE TABLE |INSERT INTO schema_migrations )/.test(s) || (selected === latestMigration && s === alter)), 'MIGRATION_FORMAT_INVALID');
  const checksum = createHash('sha256').update(bytes).digest('hex');
  if (selected === version) ensure(checksum === 'a544084c180a8c8ce701bd506bc98819d4e433b61460b1b20b7dbe4f0e1061c8', 'MIGRATION_IMMUTABLE_CHECKSUM');
  return { version: selected, checksum, statements };
}

export async function readMigrations(through = version) {
  ensure(versions.includes(through), 'MIGRATION_VERSION_INVALID');
  return Promise.all(versions.slice(0, versions.indexOf(through) + 1).map(v => readMigration(v)));
}

export async function executeMigrationStatements(connection, statements) {
  // A failed statement must prevent the final completion record from running.
  for (const statement of statements) await connection.query(statement);
}

// Conservative parser for direct SHOW GRANTS output, not arbitrary GRANT SQL.
// Never infer minimum privileges from global rights, roles or wildcard scopes.
export function checkMigrationPrivileges(rows, database, partialRevokes, { requireUpdate = false, requireAlter = false } = {}) {
  ensure(allowedSchemas.has(database), 'MIGRATION_TARGET_INVALID');
  ensure([0, 1, '0', '1'].includes(partialRevokes), 'MIGRATION_PRIVILEGE_MODE_UNKNOWN');
  ensure(Array.isArray(rows) && rows.length > 0, 'MIGRATION_PRIVILEGES_MISSING');
  const literalMode = Number(partialRevokes) === 1;
  const targetPrivileges = new Set();
  let tableAlter = false;
  for (const row of rows) {
    const values = Object.values(row);
    ensure(values.length === 1 && typeof values[0] === 'string', 'MIGRATION_GRANT_AMBIGUOUS');
    // Table-level grants use literal schema names, not database-level patterns.
    const alterGrant = values[0].match(/^GRANT ALTER ON `(skillswap_ai|skillswap_ai_test_auth)`\.`email_verifications` TO `(?:``|[^`])+`@`(?:``|[^`])+`$/);
    if (alterGrant) {
      ensure(requireAlter, 'MIGRATION_EXCESS_PRIVILEGES_REJECTED');
      if (alterGrant[1] === database) tableAlter = true;
      continue;
    }
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
  if (requireAlter) ensure(tableAlter, 'MIGRATION_PRIVILEGES_MISSING');
  ensure(required.every((privilege) => targetPrivileges.has(privilege)), 'MIGRATION_PRIVILEGES_MISSING');
}

async function inspect(connection, config, migrations) {
  const [[instance]] = await connection.query(
    'SELECT VERSION() AS version, DATABASE() AS db, @@port AS port, CURRENT_USER() AS account, @@GLOBAL.partial_revokes AS partialRevokes');
  ensure(/^8\.4\./.test(instance.version) && instance.db === config.database && instance.port === 3306,
    'MIGRATION_INSTANCE_INVALID');
  const account = instance.account.slice(0, instance.account.lastIndexOf('@'));
  ensure(account === config.user && account !== 'skillswap_app', 'MIGRATION_IDENTITY_INVALID');
  const [grants] = await connection.query('SHOW GRANTS FOR CURRENT_USER()');
  checkMigrationPrivileges(grants, config.database, instance.partialRevokes, { requireAlter: migrations.length > 1 });
  const [objects] = await connection.execute(
    'SELECT TABLE_NAME AS name, TABLE_TYPE AS type, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
    [config.database]);
  // Even a routine/event in an otherwise empty schema needs explicit review.
  const [[other]] = await connection.execute(
    'SELECT (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?) + (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ?) AS count',
    [config.database, config.database]);
  ensure(Number(other.count) === 0, 'MIGRATION_UNEXPECTED_OBJECTS');
  if (!objects.length) return 0;
  const [history] = await connection.query('SELECT version, checksum FROM schema_migrations ORDER BY version');
  ensure(history.length > 0 && history.length <= migrations.length && history.every((row, i) => row.version === migrations[i].version && row.checksum === migrations[i].checksum), 'MIGRATION_HISTORY_MISMATCH');
  const applied = migrations.slice(0, history.length);
  const tables = [...expectedTables, ...(history.length > 1 ? ['otp_request_limits'] : [])].sort();
  ensure(JSON.stringify(objects.map((o) => o.name).sort()) === JSON.stringify(tables) &&
    objects.every((o) => o.type === 'BASE TABLE' && o.engine === 'InnoDB'), 'MIGRATION_PARTIAL_OR_FOREIGN_SCHEMA');
  await checkStructure(connection, config.database, { statements: applied.flatMap(m => m.statements) });
  {
    const [status] = await connection.execute("SELECT COLUMN_DEFAULT AS value FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'email_verifications' AND COLUMN_NAME = 'status'", [config.database]);
    ensure(status.length === 1 && status[0].value === (history.length > 1 ? 'SENDING' : 'PENDING'), 'MIGRATION_STATUS_DEFAULT_MISMATCH');
    const [checks] = await connection.execute("SELECT CHECK_CLAUSE AS clause FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = 'chk_verifications_status'", [config.database]);
    // MySQL exposes charset introducers and backslash-escaped quotes in this
    // metadata. Match the entire known IN expression, never just extract words
    // from an arbitrary CHECK (which could contain an additional OR predicate).
    const clause = checks.length === 1 ? checks[0].clause.replaceAll("\\'", "'")
      .replace(/_(?:utf8mb4|utf8mb3|ascii|latin1|binary)(?=')/gi, '')
      .replaceAll('`status`', 'status').replace(/\s/g, '') : '';
    const expression = clause.match(/^\(statusin\((.*)\)\)$/i) ?? clause.match(/^statusin\((.*)\)$/i);
    const values = expression ? expression[1].split(',') : [];
    const states = values.length && values.every(value => /^'[A-Z_]+'$/.test(value))
      ? values.map(value => value.slice(1, -1)).sort() : [];
    ensure(JSON.stringify(states) === JSON.stringify([...(history.length > 1 ? ['SENDING'] : []),'PENDING','CONSUMED','REVOKED','EXPIRED','EXHAUSTED'].sort()), 'MIGRATION_STATUS_CHECK_MISMATCH');
  }
  if (migrations.length > 1 && history.length === 1) {
    const [[active]] = await connection.query("SELECT COUNT(*) AS count FROM email_verifications WHERE created_at > DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 HOUR) OR (status = 'PENDING' AND expires_at > UTC_TIMESTAMP(6))");
    ensure(Number(active.count) === 0, 'MIGRATION_LEGACY_REQUESTS_REVIEW_REQUIRED');
  }
  return history.length;
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
    const expected = [...statement.matchAll(/^  ([a-z_][a-z0-9_]*) (CHAR\(\d+\)|VARCHAR\(\d+\)|VARBINARY\(\d+\)|DATETIME\(6\)|SMALLINT UNSIGNED|INT|BOOLEAN)/gm)];
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
  apply = false, allowDdl = false, validatedChecksum, validatedChecksums = {}, through = version,
} = {}) {
  ensure(config.host === '127.0.0.1' && config.port === 3306 && config.user !== 'skillswap_app' &&
    allowedSchemas.has(config.database), 'MIGRATION_TARGET_INVALID');
  const migrations = await readMigrations(through);
  const migration = migrations.at(-1);
  if (apply) {
    ensure(allowDdl === true, 'MIGRATION_DDL_NOT_AUTHORIZED');
    ensure(validatedChecksums && typeof validatedChecksums === 'object' && !Array.isArray(validatedChecksums), 'MIGRATION_VALIDATION_MAP_INVALID');
    if (config.database === 'skillswap_ai') for (const item of migrations) {
      const checksum = through === version ? validatedChecksum : validatedChecksums[item.version];
      ensure(checksum === item.checksum, 'MIGRATION_ISOLATED_VALIDATION_REQUIRED');
    }
  }
  const report = (count, applied) => ({ state: count === migrations.length ? 'applied' : 'pending', checksum: migration.checksum, applied,
    ...(migrations.length > 1 ? { migrations: migrations.map((m,i) => ({ version: m.version, checksum: m.checksum, state: i < count ? 'applied' : 'pending' })) } : {}) });
  if (!apply) return report(await inspect(connection, config, migrations), false);
  const lockName = `skillswap-migrations:${createHash('sha256').update(config.database).digest('hex').slice(0, 32)}`;
  const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 5) AS acquired', [lockName]);
  ensure(lock.acquired === 1, 'MIGRATION_LOCK_UNAVAILABLE');
  try {
    let count = await inspect(connection, config, migrations);
    const initial = count;
    while (count < migrations.length) {
      const item = migrations[count];
      await connection.execute('SET @skillswap_migration_version = ?, @skillswap_migration_checksum = ?', [item.version, item.checksum]);
      await executeMigrationStatements(connection, item.statements);
      ensure(await inspect(connection, config, migrations) === count + 1, 'MIGRATION_POSTCHECK_FAILED');
      count++;
    }
    return report(count, count > initial);
  } finally { await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]); }
}

const direct = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  let connection;
  try {
    const args = process.argv.slice(2);
    ensure(args.length <= 2 && (args.length === 0 || ['--check', '--apply'].includes(args[0])) && (args.length < 2 || args[1] === `--through=${latestMigration}`), 'MIGRATION_ARGUMENT_INVALID');
    const apply = args[0] === '--apply';
    // Deliberately no dotenv or DB_* fallback: migration identity is separate.
    const config = migrationConfiguration(process.env, apply);
    connection = await mysql.createConnection(config);
    const result = await runMigration(connection, config, {
      apply, allowDdl: process.env.MIGRATION_ALLOW_DDL === 'yes',
      validatedChecksum: process.env.MIGRATION_VALIDATED_CHECKSUM,
      through: args[1] ? latestMigration : version,
      validatedChecksums: process.env.MIGRATION_VALIDATED_CHECKSUMS ? JSON.parse(process.env.MIGRATION_VALIDATED_CHECKSUMS) : {},
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
