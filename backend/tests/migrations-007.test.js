import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMigrationArguments, readMigration, readMigrations } from '../database/migrate.js';

const checksum = 'aafc96679930a69496175c1904e2a240e412c28e75181a1a4f558cd14bd1c6c6';

test('007 is additive, independently checksummed and ordered after immutable 001-006', async () => {
  const migrations = await readMigrations('007_sessions_booking_credits');
  assert.deepEqual(migrations.map(item => item.version), ['001_auth_foundation', '002_otp_delivery_safety',
    '003_login_rate_limits', '004_password_recovery', '005_student_profile',
    '006_mentor_skills_files', '007_sessions_booking_credits']);
  assert.equal(migrations.at(-1).checksum, checksum);
  assert.equal(migrations.at(-1).statements.length, 9);
  assert.ok(!migrations.at(-1).statements.some(statement => /^(DROP|ALTER|DELETE|UPDATE|TRUNCATE)\b/.test(statement)));
  assert.deepEqual(parseMigrationArguments(['--check', '--through=007_sessions_booking_credits']),
    { apply: false, through: '007_sessions_booking_credits' });
});

test('007 models offers, structured availability, sessions, holds, events and one review', async () => {
  const migration = await readMigration('007_sessions_booking_credits');
  const sql = migration.statements.join('\n');
  for (const table of ['mentor_offers', 'mentor_availability', 'mentoring_sessions',
    'session_credit_holds', 'mentoring_session_events', 'session_reviews']) assert.match(sql, new RegExp(`CREATE TABLE ${table}`));
  assert.match(sql, /status IN \('ACTIVE', 'PAUSED'\)/);
  assert.match(sql, /timezone = 'America\/Lima'/);
  assert.match(sql, /duration_minutes = 30 AND credit_cost = 5/);
  assert.match(sql, /duration_minutes = 60 AND credit_cost = 10/);
  assert.match(sql, /duration_minutes = 90 AND credit_cost = 15/);
  assert.match(sql, /status IN \('HELD', 'SETTLED', 'REFUNDED'\)/);
  assert.match(sql, /rating BETWEEN 1 AND 5/);
  assert.doesNotMatch(sql, /penalt|commission|purchase|withdraw|money/i);
});

test('007 provides idempotency and concurrency constraints without claiming interval exclusion in SQL', async () => {
  const migration = await readMigration('007_sessions_booking_credits');
  const session = migration.statements.find(statement => statement.startsWith('CREATE TABLE mentoring_sessions'));
  assert.match(session, /UNIQUE KEY uq_session_student_request \(student_user_id, request_key\)/);
  assert.match(session, /UNIQUE KEY uq_session_mentor_start \(mentor_user_id, starts_at\)/);
  assert.match(session, /UNIQUE KEY uq_session_student_start \(student_user_id, starts_at\)/);
  assert.match(session, /student_user_id <> mentor_user_id/);
  const events = migration.statements.find(statement => statement.startsWith('CREATE TABLE mentoring_session_events'));
  assert.match(events, /UNIQUE KEY uq_session_event_type \(session_id, event_type\)/);
  const reviews = migration.statements.find(statement => statement.startsWith('CREATE TABLE session_reviews'));
  assert.match(reviews, /PRIMARY KEY \(session_id\)/);
});
