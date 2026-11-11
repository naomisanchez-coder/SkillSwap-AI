import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/config/db.js';
import { sessionPolicy } from '../src/config/session-security.js';
import { dummyPasswordHash } from '../src/modules/auth/password.service.js';
import { createSessionRepository } from '../src/modules/auth/session.repository.js';
import { createSessionProtection } from '../src/modules/auth/session-security.js';
import { createSessionService } from '../src/modules/auth/session.service.js';
import { createStudentRepository } from '../src/modules/student/student.repository.js';
import { createStudentService } from '../src/modules/student/student.service.js';
import { createBookingRepository } from '../src/modules/student/booking.repository.js';
import { createBookingService } from '../src/modules/student/booking.service.js';
import { limaSlot } from '../src/modules/student/booking.validation.js';

const requested = Object.keys(process.env).some(key => key.startsWith('DATABASE_TEST_'));

function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  return new Promise((resolve, reject) => {
    server.once('listening', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
    server.once('error', reject);
  });
}

function futureLimaMorning() {
  const target = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(target).map(part => [part.type, part.value]));
  return new Date(`${parts.year}-${parts.month}-${parts.day}T15:00:00.000Z`);
}

test('real isolated 007 exposes the expected tables, keys, checks and indexes', {
  skip: requested ? false : '007 isolated metadata integration pending', timeout: 30000,
}, async () => {
  assert.equal(process.env.DATABASE_TEST_DB, 'skillswap_ai_test_auth');
  assert.equal(process.env.DATABASE_TEST_USER, 'skillswap_test_app');
  const database = createDatabase({ host: '127.0.0.1', port: 3306, database: process.env.DATABASE_TEST_DB,
    user: process.env.DATABASE_TEST_USER, password: process.env.DATABASE_TEST_PASSWORD });
  try {
    const expected = ['mentor_availability', 'mentor_offers', 'mentoring_session_events',
      'mentoring_sessions', 'session_credit_holds', 'session_reviews'];
    const [tables] = await database.execute(`SELECT TABLE_NAME name,ENGINE engine FROM information_schema.TABLES
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?,?,?,?) ORDER BY TABLE_NAME`, expected);
    assert.deepEqual(tables, expected.map(name => ({ name, engine: 'InnoDB' })));
    const [[foreignKeys]] = await database.execute(`SELECT COUNT(*) total FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?,?,?,?) AND CONSTRAINT_TYPE='FOREIGN KEY'`, expected);
    assert.equal(Number(foreignKeys.total), 15);
    const [checks] = await database.execute(`SELECT CONSTRAINT_NAME name,ENFORCED enforced
      FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()
      AND TABLE_NAME IN (?,?,?,?,?,?) AND CONSTRAINT_TYPE='CHECK'`, expected);
    assert.equal(checks.length, 18);
    assert.ok(checks.every(check => check.enforced === 'YES'));
    const [indexes] = await database.execute(`SELECT DISTINCT INDEX_NAME name FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?,?,?,?)`, expected);
    const names = new Set(indexes.map(index => index.name));
    for (const name of ['uq_session_student_request', 'uq_session_mentor_start', 'uq_session_student_start',
      'ix_sessions_student_status_start', 'ix_sessions_mentor_status_start', 'uq_session_event_type',
      'ix_session_reviews_mentor_created']) assert.ok(names.has(name), `missing ${name}`);
  } finally { await database.close(); }
});

test('real isolated booking is concurrent-safe and settles held credits exactly once', {
  skip: requested ? false : '007 isolated booking integration pending', timeout: 60000,
}, async () => {
  assert.equal(process.env.DATABASE_TEST_DB, 'skillswap_ai_test_auth');
  assert.equal(process.env.DATABASE_TEST_USER, 'skillswap_test_app');
  const database = createDatabase({ host: '127.0.0.1', port: 3306, database: process.env.DATABASE_TEST_DB,
    user: process.env.DATABASE_TEST_USER, password: process.env.DATABASE_TEST_PASSWORD });
  const suffix = randomBytes(8).toString('hex');
  const ids = { student: randomUUID(), mentor: randomUUID(), admin: randomUUID(), career: randomUUID(),
    skill: randomUUID(), application: randomUUID(), grant: randomUUID() };
  const protection = createSessionProtection(randomBytes(32).toString('hex'));
  const sessionRepository = createSessionRepository(database, sessionPolicy);
  const sessionService = createSessionService(sessionRepository, protection);
  const studentService = createStudentService(createStudentRepository(database));
  const bookingService = createBookingService(createBookingRepository(database));
  const sessions = { student: protection.issue(), mentor: protection.issue() };
  const start = futureLimaMorning();
  const at = hours => new Date(start.getTime() + hours * 60 * 60 * 1000).toISOString();
  let server;
  try {
    const [[identity]] = await database.execute('SELECT CURRENT_USER() account,DATABASE() db');
    assert.deepEqual(identity, { account: 'skillswap_test_app@127.0.0.1', db: 'skillswap_ai_test_auth' });
    const [migration] = await database.execute(
      "SELECT checksum FROM schema_migrations WHERE version='007_sessions_booking_credits'", []);
    assert.deepEqual(migration, [{ checksum: 'aafc96679930a69496175c1904e2a240e412c28e75181a1a4f558cd14bd1c6c6' }]);
    await database.transaction(async tx => {
      await tx.execute('INSERT INTO careers (id,code,name) VALUES (?,?,?)',
        [ids.career, `BOOKING_${suffix}`, `Reservas ${suffix}`]);
      await tx.execute('INSERT INTO career_cycles (career_id,cycle) VALUES (?,4)', [ids.career]);
      await tx.execute('INSERT INTO skill_catalog (id,code,name,category) VALUES (?,?,?,?)',
        [ids.skill, `booking-${suffix}`, `Habilidad reservas ${suffix}`, `Categoria ${suffix}`]);
      for (const [id, firstName] of [[ids.student, 'Estudiante'], [ids.mentor, 'Mentor']]) {
        await tx.execute(`INSERT INTO users (id,first_name,last_name,email,password_hash,role,status,email_verified_at,
          terms_accepted_at,terms_version,privacy_version) VALUES (?,?,?,?,?,'STUDENT','ACTIVE',UTC_TIMESTAMP(6),
          UTC_TIMESTAMP(6),'integration','integration')`,
        [id, firstName, `Aislado ${suffix}`, `${firstName.toLowerCase()}.${suffix}@tecsup.edu.pe`, dummyPasswordHash]);
        await tx.execute('INSERT INTO student_profiles (user_id,career_id,cycle,onboarding_complete) VALUES (?,?,4,TRUE)',
          [id, ids.career]);
      }
      await tx.execute(`INSERT INTO users (id,first_name,last_name,email,password_hash,role,status,email_verified_at)
        VALUES (?,?,?,?,?,'ADMIN','ACTIVE',UTC_TIMESTAMP(6))`,
      [ids.admin, 'Admin', 'Aislado', `admin.${suffix}@example.test`, dummyPasswordHash]);
      await tx.execute(`INSERT INTO mentor_applications
        (id,user_id,skill_id,status,decided_at,decided_by,decision_notes)
        VALUES (?,?,?,'APPROVED',UTC_TIMESTAMP(6),?,'Aprobación sintética aislada')`,
      [ids.application, ids.mentor, ids.skill, ids.admin]);
      await tx.execute(`INSERT INTO credit_transactions (id,user_id,amount,reason,operation_reference)
        VALUES (?,?,40,'INTEGRATION_FIXTURE',?)`, [ids.grant, ids.student, `booking:${suffix}:grant`]);
    });
    await sessionRepository.create({ ...sessions.student, userId: ids.student, remember: false });
    await sessionRepository.create({ ...sessions.mentor, userId: ids.mentor, remember: false });
    const started = await listen(createApp({ database, origins: ['http://localhost:5173'], sessionService,
      studentService, bookingService, cookie: { name: sessionPolicy.cookieName } }));
    server = started.server;
    const headers = session => ({ Cookie: `${sessionPolicy.cookieName}=${session.token}`,
      Origin: 'http://localhost:5173', 'X-CSRF-Token': session.csrfToken, 'Content-Type': 'application/json' });
    const mutate = (path, session, body = {}, method = 'POST') => fetch(`${started.base}${path}`, {
      method, headers: headers(session), body: JSON.stringify(body),
    });
    const auth = session => ({ Cookie: `${sessionPolicy.cookieName}=${session.token}` });

    const offerResponse = await mutate(`/api/student/mentor/offers/${ids.skill}`, sessions.mentor,
      { active: true }, 'PUT');
    assert.equal(offerResponse.status, 200);
    const offer = (await offerResponse.json()).offer;
    const weekday = limaSlot(start, 30).weekday;
    assert.equal((await mutate('/api/student/mentor/availability', sessions.mentor,
      { slots: [{ weekday, start: '09:00', end: '18:00' }] }, 'PUT')).status, 200);
    const publicAvailability = await fetch(
      `${started.base}/api/student/explore/mentors/${ids.mentor}/availability`, { headers: auth(sessions.student) });
    assert.equal(publicAvailability.status, 200);

    const initialCredits = await (await fetch(`${started.base}/api/student/session-credits`,
      { headers: auth(sessions.student) })).json();
    assert.deepEqual(initialCredits.credits, { total: 40, held: 0, available: 40 });
    const book = (requestId, startsAt, durationMinutes) => mutate('/api/student/bookings', sessions.student,
      { requestId, offerId: offer.id, startsAt, durationMinutes });

    const first = await book(randomUUID(), at(0), 30);
    assert.equal(first.status, 201);
    const firstSession = (await first.json()).session;
    assert.equal(firstSession.creditCost, 5);

    const duplicateKey = randomUUID();
    const duplicates = await Promise.all([book(duplicateKey, at(1), 60), book(duplicateKey, at(1), 60)]);
    assert.deepEqual(duplicates.map(response => response.status), [201, 201]);
    const duplicateBodies = await Promise.all(duplicates.map(response => response.json()));
    assert.equal(duplicateBodies[0].session.id, duplicateBodies[1].session.id);
    assert.equal(duplicateBodies[0].session.creditCost, 10);
    const duplicateSession = duplicateBodies[0].session;

    const third = await book(randomUUID(), at(3), 90);
    assert.equal(third.status, 201);
    const thirdSession = (await third.json()).session;
    assert.equal(thirdSession.creditCost, 15);
    assert.equal((await book(randomUUID(), at(5), 90)).status, 409);
    assert.equal((await book(randomUUID(), new Date(start.getTime() + 15 * 60000).toISOString(), 30)).status, 409);

    const sameStart = at(7);
    const concurrent = await Promise.all([book(randomUUID(), sameStart, 30), book(randomUUID(), sameStart, 30)]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [201, 409]);
    const heldCredits = await (await fetch(`${started.base}/api/student/session-credits`,
      { headers: auth(sessions.student) })).json();
    assert.deepEqual(heldCredits.credits, { total: 40, held: 35, available: 5 });

    const meeting = `/api/student/sessions/${firstSession.id}/meeting-link`;
    assert.equal((await mutate(meeting, sessions.mentor, { url: 'https://meet.google.com/abc-defg-hij' }, 'PUT')).status, 200);
    assert.equal((await mutate(`/api/student/sessions/${firstSession.id}/start`, sessions.student)).status, 403);
    await database.execute(`UPDATE mentoring_sessions SET starts_at=UTC_TIMESTAMP(6)-INTERVAL 1 MINUTE,
      ends_at=UTC_TIMESTAMP(6)+INTERVAL 29 MINUTE WHERE id=?`, [firstSession.id]);
    assert.equal((await mutate(`/api/student/sessions/${firstSession.id}/start`, sessions.mentor)).status, 200);
    assert.equal((await mutate(`/api/student/sessions/${firstSession.id}/cancel`, sessions.student)).status, 409);
    await database.execute(`UPDATE mentoring_sessions SET starts_at=UTC_TIMESTAMP(6)-INTERVAL 31 MINUTE,
      ends_at=UTC_TIMESTAMP(6)-INTERVAL 1 MINUTE WHERE id=?`, [firstSession.id]);
    assert.equal((await mutate(`/api/student/sessions/${firstSession.id}/performed`, sessions.mentor)).status, 200);
    assert.equal((await mutate(`/api/student/sessions/${firstSession.id}/validate`, sessions.mentor)).status, 403);
    assert.equal((await mutate(`/api/student/sessions/${firstSession.id}/validate`, sessions.student)).status, 200);
    assert.equal((await mutate(`/api/student/sessions/${firstSession.id}/validate`, sessions.student)).status, 200);

    const afterSettlement = await (await fetch(`${started.base}/api/student/session-credits`,
      { headers: auth(sessions.student) })).json();
    assert.deepEqual(afterSettlement.credits, { total: 35, held: 30, available: 5 });
    const mentorCredits = await (await fetch(`${started.base}/api/student/session-credits`,
      { headers: auth(sessions.mentor) })).json();
    assert.deepEqual(mentorCredits.credits, { total: 5, held: 0, available: 5 });

    const reviewPath = `/api/student/sessions/${firstSession.id}/reviews`;
    assert.equal((await mutate(reviewPath, sessions.student, { rating: 5, comment: 'Sesión aislada' })).status, 201);
    assert.equal((await mutate(reviewPath, sessions.student, { rating: 5, comment: 'Sesión aislada' })).status, 201);
    assert.equal((await mutate(reviewPath, sessions.student, { rating: 4 })).status, 409);

    const cancelPath = `/api/student/sessions/${duplicateSession.id}/cancel`;
    const cancellations = await Promise.all([
      mutate(cancelPath, sessions.student), mutate(cancelPath, sessions.mentor),
    ]);
    assert.deepEqual(cancellations.map(response => response.status), [200, 200]);
    assert.ok((await Promise.all(cancellations.map(response => response.json())))
      .every(body => body.session.status === 'CANCELLED'));
    assert.equal((await mutate(cancelPath, sessions.student)).status, 200);
    const afterRefund = await (await fetch(`${started.base}/api/student/session-credits`,
      { headers: auth(sessions.student) })).json();
    assert.deepEqual(afterRefund.credits, { total: 35, held: 20, available: 15 });

    const collisionId = randomUUID();
    await database.execute(`INSERT INTO credit_transactions
      (id,user_id,amount,reason,operation_reference) VALUES (?,?,1,'INTEGRATION_FIXTURE',?)`,
    [collisionId, ids.student, `session:${thirdSession.id}:refund`]);
    assert.equal((await mutate(`/api/student/sessions/${thirdSession.id}/cancel`, sessions.student)).status, 500);
    const [[rolledBack]] = await database.execute(`SELECT s.status,h.status hold_status,
      (SELECT COUNT(*) FROM mentoring_session_events e WHERE e.session_id=s.id AND e.event_type='CANCELLED') events
      FROM mentoring_sessions s JOIN session_credit_holds h ON h.session_id=s.id WHERE s.id=?`, [thirdSession.id]);
    assert.deepEqual({ status: rolledBack.status, hold: rolledBack.hold_status, events: Number(rolledBack.events) },
      { status: 'UPCOMING', hold: 'HELD', events: 0 });
    await database.execute('DELETE FROM credit_transactions WHERE id=?', [collisionId]);

    const dashboard = await (await fetch(`${started.base}/api/student/dashboard`,
      { headers: auth(sessions.student) })).json();
    assert.deepEqual({ total: dashboard.dashboard.credits.total, held: dashboard.dashboard.credits.held,
      available: dashboard.dashboard.credits.available }, { total: 35, held: 20, available: 15 });
    assert.ok(dashboard.dashboard.credits.movements.some(item => item.reason === 'SESSION_REFUND'));
    assert.equal(dashboard.dashboard.sessions.upcoming.length, 2);
    assert.equal(dashboard.dashboard.sessions.completed.length, 1);
    assert.deepEqual(dashboard.dashboard.sessions.completed[0].review,
      { rating: 5, comment: 'Sesión aislada' });
    assert.deepEqual(dashboard.dashboard.progress,
      { completedSessions: 1, completedMinutes: 30, reviewedSessions: 1 });

    const [[counts]] = await database.execute(`SELECT
      (SELECT COUNT(*) FROM mentoring_sessions WHERE student_user_id=?) sessions,
      (SELECT COUNT(*) FROM credit_transactions WHERE user_id=? AND reason='SESSION_HOLD') holds,
      (SELECT COUNT(*) FROM credit_transactions WHERE user_id=? AND reason='SESSION_REFUND') refunds,
      (SELECT COUNT(*) FROM credit_transactions WHERE user_id=? AND reason='SESSION_EARNING') earnings,
      (SELECT COUNT(*) FROM session_credit_holds h JOIN mentoring_sessions s ON s.id=h.session_id
        WHERE s.student_user_id=? AND h.status='SETTLED') settled,
      (SELECT COUNT(*) FROM session_credit_holds h JOIN mentoring_sessions s ON s.id=h.session_id
        WHERE s.student_user_id=? AND h.status='REFUNDED') refunded`,
    [ids.student, ids.student, ids.student, ids.mentor, ids.student, ids.student]);
    assert.deepEqual(Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value)])),
      { sessions: 4, holds: 4, refunds: 1, earnings: 1, settled: 1, refunded: 1 });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      await database.transaction(async tx => {
        await tx.execute(`DELETE r FROM session_reviews r JOIN mentoring_sessions s ON s.id=r.session_id
          WHERE s.student_user_id=? OR s.mentor_user_id=?`, [ids.student, ids.mentor]);
        await tx.execute(`DELETE e FROM mentoring_session_events e JOIN mentoring_sessions s ON s.id=e.session_id
          WHERE s.student_user_id=? OR s.mentor_user_id=?`, [ids.student, ids.mentor]);
        await tx.execute(`DELETE h FROM session_credit_holds h JOIN mentoring_sessions s ON s.id=h.session_id
          WHERE s.student_user_id=? OR s.mentor_user_id=?`, [ids.student, ids.mentor]);
        await tx.execute('DELETE FROM mentoring_sessions WHERE student_user_id=? OR mentor_user_id=?', [ids.student, ids.mentor]);
        await tx.execute('DELETE FROM mentor_availability WHERE mentor_user_id=?', [ids.mentor]);
        await tx.execute('DELETE FROM mentor_offers WHERE mentor_user_id=?', [ids.mentor]);
        await tx.execute('DELETE FROM credit_transactions WHERE user_id IN (?,?)', [ids.student, ids.mentor]);
        await tx.execute('DELETE FROM mentor_applications WHERE id=?', [ids.application]);
        await tx.execute('DELETE FROM auth_sessions WHERE user_id IN (?,?)', [ids.student, ids.mentor]);
        await tx.execute('DELETE FROM student_profiles WHERE user_id IN (?,?)', [ids.student, ids.mentor]);
        await tx.execute('DELETE FROM users WHERE id IN (?,?,?)', [ids.student, ids.mentor, ids.admin]);
        await tx.execute('DELETE FROM skill_catalog WHERE id=?', [ids.skill]);
        await tx.execute('DELETE FROM career_cycles WHERE career_id=?', [ids.career]);
        await tx.execute('DELETE FROM careers WHERE id=?', [ids.career]);
      });
      const [[residual]] = await database.execute(`SELECT
        (SELECT COUNT(*) FROM users WHERE id IN (?,?,?)) users,
        (SELECT COUNT(*) FROM mentoring_sessions WHERE student_user_id=? OR mentor_user_id=?) sessions,
        (SELECT COUNT(*) FROM credit_transactions WHERE user_id IN (?,?)) credits,
        (SELECT COUNT(*) FROM mentor_applications WHERE id=?) applications`,
      [ids.student, ids.mentor, ids.admin, ids.student, ids.mentor, ids.student, ids.mentor, ids.application]);
      assert.deepEqual(Object.fromEntries(Object.entries(residual).map(([key, value]) => [key, Number(value)])),
        { users: 0, sessions: 0, credits: 0, applications: 0 });
    } finally { await database.close(); }
  }
});
