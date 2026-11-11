import test from 'node:test';
import assert from 'node:assert/strict';
import { latestMigration, parseMigrationArguments, readMigration, readMigrations } from '../database/migrate.js';

const checksum = '8494f88eec39e615ec44b14e2970f6c017479ab00d2e6769d4a2e39fda8aede3';

test('006 is additive, checksummed and ordered after the five immutable migrations', async () => {
  assert.equal(latestMigration, '006_mentor_skills_files');
  const migrations = await readMigrations(latestMigration);
  assert.deepEqual(migrations.map(item => item.version), ['001_auth_foundation',
    '002_otp_delivery_safety', '003_login_rate_limits', '004_password_recovery',
    '005_student_profile', '006_mentor_skills_files']);
  assert.equal(migrations.at(-1).checksum, checksum);
  assert.equal(migrations.at(-1).statements.length, 10);
  assert.deepEqual(migrations.at(-1).statements.filter(statement => statement.startsWith('CREATE TABLE '))
    .map(statement => statement.match(/^CREATE TABLE ([a-z_]+)/)[1]), [
      'skill_catalog', 'student_skills', 'private_files', 'student_profile_photos',
      'mentor_applications', 'mentor_application_documents', 'mentor_application_events']);
  assert.ok(!migrations.at(-1).statements.some(statement => /^(DROP|ALTER|DELETE|UPDATE|TRUNCATE)\b/.test(statement)));
  assert.deepEqual(parseMigrationArguments(['--check', '--through=006_mentor_skills_files']),
    { apply: false, through: '006_mentor_skills_files' });
});

test('006 separates interests, catalog skills, declared intents, approvals and private documents', async () => {
  const migration = await readMigration('006_mentor_skills_files');
  const sql = migration.statements.join('\n');
  assert.match(sql, /CREATE TABLE skill_catalog/);
  assert.match(sql, /CREATE TABLE student_skills/);
  assert.match(sql, /intent IN \('LEARN', 'TEACH'\)/);
  assert.match(sql, /status IN \('PENDING', 'APPROVED', 'REJECTED'\)/);
  assert.match(sql, /purpose IN \('PROFILE_PHOTO', 'MENTOR_CERTIFICATE', 'MENTOR_PORTFOLIO'\)/);
  assert.match(sql, /size_bytes BETWEEN 1 AND 2097152/);
  assert.match(sql, /size_bytes BETWEEN 1 AND 5242880/);
  assert.match(sql, /CREATE TABLE mentor_application_events/);
  assert.doesNotMatch(sql, /CREATE TABLE (?:users|student_profiles)|\bBLOB\b/i);
});

test('006 requires one application per student and skill while allowing several approved skills per account', async () => {
  const migration = await readMigration('006_mentor_skills_files');
  const application = migration.statements.find(statement => statement.startsWith('CREATE TABLE mentor_applications'));
  assert.match(application, /UNIQUE KEY uq_mentor_application_user_skill \(user_id, skill_id\)/);
  assert.match(application, /FOREIGN KEY \(user_id\) REFERENCES student_profiles \(user_id\)/);
  assert.match(application, /FOREIGN KEY \(skill_id\) REFERENCES skill_catalog \(id\)/);
  assert.doesNotMatch(application, /UNIQUE KEY[^\n]+\(user_id\)(?:,|\))/);
});
