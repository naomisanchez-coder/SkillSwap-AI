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

const requested = Object.keys(process.env).some(key => key.startsWith('DATABASE_TEST_'));
const origin = 'http://localhost:5173';

function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  return new Promise((resolve, reject) => {
    server.once('listening', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
    server.once('error', reject);
  });
}

async function json(response) {
  return { status: response.status, body: await response.json() };
}

test('real isolated HTTP profile enforces ownership, CSRF, permissions, atomicity and onboarding', {
  skip: requested ? false : '005 isolated HTTP integration pending', timeout: 60000,
}, async () => {
  assert.equal(process.env.DATABASE_TEST_DB, 'skillswap_ai_test_auth');
  assert.equal(process.env.DATABASE_TEST_USER, 'skillswap_test_app');
  const database = createDatabase({ host: '127.0.0.1', port: 3306,
    database: process.env.DATABASE_TEST_DB, user: process.env.DATABASE_TEST_USER,
    password: process.env.DATABASE_TEST_PASSWORD });
  const studentId = randomUUID(), adminId = randomUUID(), careerId = randomUUID();
  const verificationId = randomUUID();
  const creditIds = [randomUUID(), randomUUID(), randomUUID()];
  const suffix = randomBytes(8).toString('hex');
  const protection = createSessionProtection(randomBytes(32).toString('hex'));
  const sessionRepository = createSessionRepository(database, sessionPolicy);
  const sessionService = createSessionService(sessionRepository, protection);
  const studentService = createStudentService(createStudentRepository(database));
  const studentSession = protection.issue(), adminSession = protection.issue();
  let server;
  try {
    const [[identity]] = await database.execute('SELECT CURRENT_USER() account,DATABASE() db');
    assert.equal(identity.account, 'skillswap_test_app@127.0.0.1');
    assert.equal(identity.db, 'skillswap_ai_test_auth');
    const catalog = [{ id: careerId, code: `PROFILE_HTTP_${suffix}`, name: `Perfil HTTP ${suffix}`, cycle: 3 }];
    await database.transaction(async tx => {
      await tx.execute('INSERT INTO careers (id,code,name) VALUES (?,?,?)',
        [catalog[0].id, catalog[0].code, catalog[0].name]);
      await tx.execute('INSERT INTO career_cycles (career_id,cycle) VALUES (?,?)',
        [catalog[0].id, catalog[0].cycle]);
      await tx.execute(`INSERT INTO users (id,first_name,last_name,email,password_hash,role,status,email_verified_at,
        terms_accepted_at,terms_version,privacy_version) VALUES (?,?,?,?,?,'STUDENT','ACTIVE',UTC_TIMESTAMP(6),
        UTC_TIMESTAMP(6),'integration','integration')`,
      [studentId, 'Perfil', 'Integracion', `perfil.http.${suffix}@tecsup.edu.pe`, dummyPasswordHash]);
      await tx.execute(`INSERT INTO student_profiles (user_id,career_id,cycle,onboarding_complete)
        VALUES (?,?,?,FALSE)`, [studentId, catalog[0].id, catalog[0].cycle]);
      await tx.execute(`INSERT INTO users (id,first_name,last_name,email,password_hash,role,status,email_verified_at)
        VALUES (?,?,?,?,?,'ADMIN','ACTIVE',UTC_TIMESTAMP(6))`,
      [adminId, 'Admin', 'Integracion', `admin.http.${suffix}@example.test`, dummyPasswordHash]);
    });
    await sessionRepository.create({ ...studentSession, userId: studentId, remember: false });
    await sessionRepository.create({ ...adminSession, userId: adminId, remember: false });
    const started = await listen(createApp({ database, origins: [origin], sessionService, studentService,
      cookie: { name: sessionPolicy.cookieName } }));
    server = started.server;
    const studentHeaders = { Cookie: `${sessionPolicy.cookieName}=${studentSession.token}` };
    const mutationHeaders = { ...studentHeaders, Origin: origin, 'Content-Type': 'application/json',
      'X-CSRF-Token': studentSession.csrfToken };

    assert.equal((await fetch(`${started.base}/api/student/profile`)).status, 401);
    assert.equal((await fetch(`${started.base}/api/student/profile`, { headers: {
      Cookie: `${sessionPolicy.cookieName}=${adminSession.token}` } })).status, 403);

    const initial = await json(await fetch(`${started.base}/api/student/profile?userId=${adminId}`,
      { headers: studentHeaders }));
    assert.equal(initial.status, 200);
    assert.equal(initial.body.profile.id, studentId);
    assert.equal(initial.body.profile.email, `perfil.http.${suffix}@tecsup.edu.pe`);
    assert.equal(initial.body.profile.onboardingComplete, false);

    const emptyCredits = await json(await fetch(`${started.base}/api/student/credits`, { headers: studentHeaders }));
    assert.equal(emptyCredits.status, 200);
    assert.equal(emptyCredits.body.credits.balance, 0);
    assert.equal(emptyCredits.body.credits.totalTransactions, 0);
    assert.deepEqual(emptyCredits.body.credits.transactions, []);
    assert.equal((await fetch(`${started.base}/api/student/credits?userId=${adminId}`,
      { headers: studentHeaders })).status, 422);
    assert.equal((await fetch(`${started.base}/api/student/dashboard`, { headers: {
      Cookie: `${sessionPolicy.cookieName}=${adminSession.token}` } })).status, 403);

    await database.transaction(async tx => {
      await tx.execute(`INSERT INTO email_verifications
        (id,user_id,code_hmac,hmac_key_version,status,attempts,max_attempts,expires_at,consumed_at)
        VALUES (?,?,?,'integration-v1','CONSUMED',0,5,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 10 MINUTE),UTC_TIMESTAMP(6))`,
      [verificationId, studentId, Buffer.alloc(32, 1)]);
      await tx.execute(`INSERT INTO credit_transactions
        (id,user_id,amount,reason,operation_reference,verification_id,created_at)
        VALUES (?,?,20,'INITIAL_EMAIL_VERIFICATION',?,?,DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 2 MINUTE))`,
      [creditIds[0], studentId, `profile-http-initial:${suffix}`, verificationId]);
      await tx.execute(`INSERT INTO credit_transactions (id,user_id,amount,reason,operation_reference,created_at)
        VALUES (?,?,-5,'TEST_RESERVATION_HOLD',?,DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 MINUTE))`,
      [creditIds[1], studentId, `profile-http-hold:${suffix}`]);
      await tx.execute(`INSERT INTO credit_transactions (id,user_id,amount,reason,operation_reference,created_at)
        VALUES (?,?,5,'TEST_REFUND',?,UTC_TIMESTAMP(6))`,
      [creditIds[2], studentId, `profile-http-refund:${suffix}`]);
    });
    const firstPage = (await json(await fetch(`${started.base}/api/student/credits?limit=2`,
      { headers: studentHeaders }))).body.credits;
    assert.equal(firstPage.balance, 20);
    assert.equal(firstPage.totalTransactions, 3);
    assert.deepEqual(firstPage.transactions.map(item => item.amount), [5, -5]);
    assert.ok(firstPage.pagination.nextCursor);
    const secondPage = (await json(await fetch(`${started.base}/api/student/credits?limit=2&cursor=${firstPage.pagination.nextCursor}`,
      { headers: studentHeaders }))).body.credits;
    assert.equal(secondPage.balance, 20);
    assert.deepEqual(secondPage.transactions.map(item => item.amount), [20]);
    assert.equal(secondPage.pagination.nextCursor, null);
    const dashboard = (await json(await fetch(`${started.base}/api/student/dashboard`,
      { headers: studentHeaders }))).body.dashboard;
    assert.equal(dashboard.credits.balance, 20);
    assert.equal(dashboard.activity.creditTransactions, 3);
    assert.equal(dashboard.student.onboardingComplete, false);

    const catalogResponse = await json(await fetch(`${started.base}/api/student/catalog`, { headers: studentHeaders }));
    assert.equal(catalogResponse.status, 200);
    assert.ok(catalogResponse.body.careers.some(career => career.code === catalog[0].code));

    const rejected = await json(await fetch(`${started.base}/api/student/profile`, { method: 'PATCH',
      headers: mutationHeaders, body: JSON.stringify({ role: 'ADMIN', email: 'otro@tecsup.edu.pe', userId: adminId }) }));
    assert.equal(rejected.status, 422);
    assert.equal(rejected.body.error.code, 'VALIDATION_ERROR');
    assert.equal((await fetch(`${started.base}/api/student/profile`, { method: 'PATCH', headers: {
      ...studentHeaders, Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': '0'.repeat(64) },
    body: JSON.stringify({ bio: 'No debe persistir' }) })).status, 403);

    const profileUpdate = await json(await fetch(`${started.base}/api/student/profile`, { method: 'PATCH',
      headers: mutationHeaders, body: JSON.stringify({ firstName: 'Perfil HTTP', lastName: 'Aislado',
        bio: 'Biografia persistida', goals: 'Aprender de forma colaborativa', career: catalog[0].name,
        cycle: Number(catalog[0].cycle) }) }));
    assert.equal(profileUpdate.status, 200);
    assert.equal(profileUpdate.body.profile.firstName, 'Perfil HTTP');
    assert.equal(profileUpdate.body.profile.email, `perfil.http.${suffix}@tecsup.edu.pe`);

    const beforeOnboarding = await json(await fetch(`${started.base}/api/student/onboarding`,
      { headers: studentHeaders }));
    assert.deepEqual(beforeOnboarding, { status: 200, body: { onboarding: {
      interests: [], level: null, schedule: null, complete: false } } });
    const completed = await json(await fetch(`${started.base}/api/student/onboarding`, { method: 'PUT',
      headers: mutationHeaders, body: JSON.stringify({ interests: ['Python', 'Mentoria'],
        level: 'Intermedio', schedule: 'Tardes entre semana' }) }));
    assert.equal(completed.status, 200);
    assert.equal(completed.body.onboarding.complete, true);

    const concurrentBodies = [
      { bio: 'Actualizacion concurrente A', interests: ['Python', 'Datos'], level: 'Inicial', schedule: 'Mananas' },
      { bio: 'Actualizacion concurrente B', interests: ['JavaScript', 'UX'], level: 'Avanzado', schedule: 'Noches' },
    ];
    const concurrent = await Promise.all(concurrentBodies.map(body => fetch(`${started.base}/api/student/profile`, {
      method: 'PATCH', headers: mutationHeaders, body: JSON.stringify(body) })));
    assert.deepEqual(concurrent.map(response => response.status), [200, 200]);
    const finalProfile = (await json(await fetch(`${started.base}/api/student/profile`, { headers: studentHeaders }))).body.profile;
    assert.ok(concurrentBodies.some(body => body.bio === finalProfile.bio && body.level === finalProfile.level &&
      body.schedule === finalProfile.schedule && JSON.stringify(body.interests) === JSON.stringify(finalProfile.interests)));

    const snapshot = { firstName: finalProfile.firstName, interests: finalProfile.interests };
    const rolledBack = await fetch(`${started.base}/api/student/profile`, { method: 'PATCH',
      headers: mutationHeaders, body: JSON.stringify({ firstName: 'No Persistir', interests: ['Cafe', 'Cafe\u0301'] }) });
    assert.equal(rolledBack.status, 500);
    const afterRollback = (await json(await fetch(`${started.base}/api/student/profile`, { headers: studentHeaders }))).body.profile;
    assert.equal(afterRollback.firstName, snapshot.firstName);
    assert.deepEqual(afterRollback.interests, snapshot.interests);

    const [[stored]] = await database.execute(`SELECT u.email,u.role,p.onboarding_complete,d.bio,d.learning_level,
      d.learning_goals,d.preferred_schedule FROM users u JOIN student_profiles p ON p.user_id=u.id
      JOIN student_profile_details d ON d.user_id=u.id WHERE u.id=?`, [studentId]);
    assert.equal(stored.email, `perfil.http.${suffix}@tecsup.edu.pe`);
    assert.equal(stored.role, 'STUDENT');
    assert.equal(stored.onboarding_complete, 1);
    assert.equal(stored.bio, finalProfile.bio);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      await database.transaction(async tx => {
        await tx.execute('DELETE FROM auth_sessions WHERE user_id IN (?,?)', [studentId, adminId]);
        await tx.execute('DELETE FROM credit_transactions WHERE user_id=?', [studentId]);
        await tx.execute('DELETE FROM email_verifications WHERE user_id=?', [studentId]);
        await tx.execute('DELETE FROM student_interests WHERE user_id=?', [studentId]);
        await tx.execute('DELETE FROM student_profile_details WHERE user_id=?', [studentId]);
        await tx.execute('DELETE FROM student_profiles WHERE user_id=?', [studentId]);
        await tx.execute('DELETE FROM users WHERE id IN (?,?)', [studentId, adminId]);
        await tx.execute('DELETE FROM career_cycles WHERE career_id=?', [careerId]);
        await tx.execute('DELETE FROM careers WHERE id=?', [careerId]);
      });
    } finally { await database.close(); }
  }
});
