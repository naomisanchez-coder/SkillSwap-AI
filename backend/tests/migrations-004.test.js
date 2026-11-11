import test from 'node:test';
import assert from 'node:assert/strict';
import { readMigration, readMigrations, parseMigrationArguments,
  checkMigrationPrivileges } from '../database/migrate.js';

const checksum = '7de62a5ab27fc01dc59155908be5eb3fbe1fd73bb6c3f3a7327caddd67c8abba';
const migrationVersion = '004_password_recovery';

test('004 is additive, independently checksummed and preserves 001-003 order', async () => {
  const migrations = await readMigrations(migrationVersion);
  assert.deepEqual(migrations.map(item => item.version), ['001_auth_foundation', '002_otp_delivery_safety',
    '003_login_rate_limits', '004_password_recovery']);
  assert.deepEqual(migrations.slice(0, 3).map(item => item.checksum), [
    'a544084c180a8c8ce701bd506bc98819d4e433b61460b1b20b7dbe4f0e1061c8',
    'bd3cdf30528264baad434993caf1c0334a64bb6ca4d71bcc6518cc3b7d974c8e',
    '46866a4e7d745276542b1276445b40bc5424ae9667716f864d562d05693eebc2']);
  const migration = await readMigration(migrationVersion); assert.equal(migration.checksum, checksum);
  assert.equal(migration.statements.length, 5);
  assert.deepEqual(migration.statements.filter(statement => statement.startsWith('CREATE TABLE '))
    .map(statement => statement.match(/^CREATE TABLE ([a-z_]+)/)[1]),
  ['password_recovery_limits', 'password_recovery_challenges']);
  assert.ok(!migration.statements.some(statement => /^(DROP|ALTER|DELETE|UPDATE|TRUNCATE)\b/.test(statement)));
});

test('004 limits contain no plaintext email/IP and enforce fixed bounded windows', async () => {
  const migration = await readMigration(migrationVersion), limits = migration.statements[2];
  assert.match(limits, /PRIMARY KEY \(scope, identifier_hmac\)/);
  assert.match(limits, /KEY ix_password_recovery_limit_expiry \(expires_at\)/);
  assert.match(limits, /scope IN \('EMAIL', 'IP'\)/);
  assert.match(limits, /OCTET_LENGTH\(identifier_hmac\) = 32/);
  assert.match(limits, /INTERVAL 1 HOUR/); assert.match(limits, /WHEN 'EMAIL' THEN 5 WHEN 'IP' THEN 20/);
  assert.doesNotMatch(limits, /^\s+(email|ip)\s+(?:VAR)?CHAR/gmi);
});

test('004 challenge has protected code, user FK, attempts, states and expiry indexes', async () => {
  const challenge = (await readMigration(migrationVersion)).statements[3];
  assert.match(challenge, /code_hmac VARBINARY\(32\)/); assert.doesNotMatch(challenge, /^\s+code\s+/gmi);
  assert.match(challenge, /FOREIGN KEY \(user_id\) REFERENCES users \(id\)/);
  assert.match(challenge, /status IN \('SENDING', 'PENDING', 'CONSUMED', 'REVOKED', 'EXPIRED', 'EXHAUSTED'\)/);
  assert.match(challenge, /max_attempts = 5 AND attempts <= max_attempts/);
  assert.match(challenge, /KEY ix_password_recovery_user_status \(user_id, status\)/);
  assert.match(challenge, /KEY ix_password_recovery_expiry \(expires_at\)/);
});

test('CLI selects 004 explicitly and schema grant needs REFERENCES but no ALTER', () => {
  assert.deepEqual(parseMigrationArguments(['--check', '--through=004_password_recovery']),
    { apply: false, through: '004_password_recovery' });
  const minimum = { grant: 'GRANT SELECT, INSERT, CREATE, REFERENCES ON `skillswap\\_ai\\_test\\_auth`.* TO `isolated_migrator`@`127.0.0.1`' };
  checkMigrationPrivileges([minimum], 'skillswap_ai_test_auth', 0, { requireReferences: true });
  assert.throws(() => checkMigrationPrivileges([{ grant: 'GRANT SELECT, INSERT, CREATE ON `skillswap\\_ai\\_test\\_auth`.* TO `isolated_migrator`@`127.0.0.1`' }],
    'skillswap_ai_test_auth', 0, { requireReferences: true }), error => error.code === 'MIGRATION_PRIVILEGES_MISSING');
});
