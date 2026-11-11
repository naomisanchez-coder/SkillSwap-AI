import test from 'node:test';
import assert from 'node:assert/strict';
import { latestMigration, parseMigrationArguments, readMigration, readMigrations } from '../database/migrate.js';

const checksum = '9f1cdc5fa257d9c2695bb4bc72a86566b26b7198ba5187f47f78a96083579cae';

test('008 is additive, independently checksummed and ordered after immutable 001-007', async () => {
  assert.equal(latestMigration, '008_mentor_skill_levels');
  const migrations = await readMigrations(latestMigration);
  assert.deepEqual(migrations.map(item => item.version), ['001_auth_foundation', '002_otp_delivery_safety',
    '003_login_rate_limits', '004_password_recovery', '005_student_profile',
    '006_mentor_skills_files', '007_sessions_booking_credits', '008_mentor_skill_levels']);
  assert.equal(migrations.at(-1).checksum, checksum);
  assert.equal(migrations.at(-1).statements.length, 5);
  assert.ok(!migrations.at(-1).statements.some(statement => /^(DROP|ALTER|DELETE|UPDATE|TRUNCATE)\b/.test(statement)));
  assert.deepEqual(parseMigrationArguments(['--check', '--through=008_mentor_skill_levels']),
    { apply: false, through: '008_mentor_skill_levels' });
});

test('008 models an empty administrable level catalog and one audited level per mentor offer', async () => {
  const migration = await readMigration(latestMigration);
  const catalog = migration.statements.find(statement => statement.startsWith('CREATE TABLE skill_level_catalog'));
  const levels = migration.statements.find(statement => statement.startsWith('CREATE TABLE mentor_skill_levels'));
  assert.match(catalog, /PRIMARY KEY \(code\)/);
  assert.match(catalog, /UNIQUE KEY uq_skill_level_rank \(rank_value\)/);
  assert.match(catalog, /rank_value BETWEEN 1 AND 100/);
  assert.match(levels, /PRIMARY KEY \(offer_id\)/);
  assert.match(levels, /FOREIGN KEY \(offer_id\) REFERENCES mentor_offers \(id\)/);
  assert.match(levels, /FOREIGN KEY \(level_code\) REFERENCES skill_level_catalog \(code\)/);
  assert.match(levels, /FOREIGN KEY \(assigned_by\) REFERENCES users \(id\)/);
  assert.doesNotMatch(migration.statements.join('\n'), /INSERT INTO (?:skill_level_catalog|mentor_skill_levels)/);
});
