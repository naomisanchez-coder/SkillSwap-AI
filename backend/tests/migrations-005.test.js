import test from 'node:test';
import assert from 'node:assert/strict';
import { latestMigration, readMigration, readMigrations, parseMigrationArguments,
  checkMigrationPrivileges } from '../database/migrate.js';

const checksum = 'adf668d8ef24c9b9cc21808f7c46491fd608182c36170325dc2cd682faadf4dd';

test('005 is additive, independently checksummed and preserves 001-004 order', async () => {
  assert.equal(latestMigration, '005_student_profile');
  const migrations = await readMigrations(latestMigration);
  assert.deepEqual(migrations.map(item => item.version), ['001_auth_foundation',
    '002_otp_delivery_safety', '003_login_rate_limits', '004_password_recovery',
    '005_student_profile']);
  assert.deepEqual(migrations.slice(0, 4).map(item => item.checksum), [
    'a544084c180a8c8ce701bd506bc98819d4e433b61460b1b20b7dbe4f0e1061c8',
    'bd3cdf30528264baad434993caf1c0334a64bb6ca4d71bcc6518cc3b7d974c8e',
    '46866a4e7d745276542b1276445b40bc5424ae9667716f864d562d05693eebc2',
    '7de62a5ab27fc01dc59155908be5eb3fbe1fd73bb6c3f3a7327caddd67c8abba']);
  const migration = await readMigration(latestMigration);
  assert.equal(migration.checksum, checksum);
  assert.equal(migration.statements.length, 5);
  assert.deepEqual(migration.statements.filter(statement => statement.startsWith('CREATE TABLE '))
    .map(statement => statement.match(/^CREATE TABLE ([a-z_]+)/)[1]),
  ['student_profile_details', 'student_interests']);
  assert.ok(!migration.statements.some(statement => /^(DROP|ALTER|DELETE|UPDATE|TRUNCATE)\b/.test(statement)));
});

test('005 stores confirmed profile fields without duplicating identity or academic data', async () => {
  const migration = await readMigration(latestMigration);
  const details = migration.statements[2], interests = migration.statements[3];
  for (const field of ['bio VARCHAR(500)', 'learning_level VARCHAR(30)',
    'learning_goals VARCHAR(1000)', 'preferred_schedule VARCHAR(500)']) assert.ok(details.includes(field));
  assert.match(details, /PRIMARY KEY \(user_id\)/);
  assert.match(details, /FOREIGN KEY \(user_id\) REFERENCES student_profiles \(user_id\)/);
  assert.match(interests, /PRIMARY KEY \(user_id, position\)/);
  assert.match(interests, /UNIQUE KEY uq_student_interest \(user_id, interest\)/);
  assert.match(interests, /position BETWEEN 1 AND 10/);
  assert.doesNotMatch(`${details}\n${interests}`, /email|password|role|credit|career_id|cycle/);
});

test('CLI selects 005 and requires only additive table privileges', () => {
  assert.deepEqual(parseMigrationArguments(['--check', '--through=005_student_profile']),
    { apply: false, through: '005_student_profile' });
  const grant = { grant: 'GRANT SELECT, INSERT, CREATE, REFERENCES ON `skillswap\\_ai\\_test\\_auth`.* TO `isolated_migrator`@`127.0.0.1`' };
  checkMigrationPrivileges([grant], 'skillswap_ai_test_auth', 0, { requireReferences: true });
});
