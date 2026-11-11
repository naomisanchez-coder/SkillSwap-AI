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
import { createExploreRepository } from '../src/modules/student/explore.repository.js';
import { createExploreService } from '../src/modules/student/explore.service.js';
import { createStudentRepository } from '../src/modules/student/student.repository.js';
import { createStudentService } from '../src/modules/student/student.service.js';

const requested = Object.keys(process.env).some(key => key.startsWith('DATABASE_TEST_'));

function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  return new Promise((resolve, reject) => {
    server.once('listening', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
    server.once('error', reject);
  });
}

test('real isolated explore exposes approved mentors and deterministic partial recommendations without private data', {
  skip: requested ? false : '006 isolated explore integration pending', timeout: 60000,
}, async () => {
  assert.equal(process.env.DATABASE_TEST_DB, 'skillswap_ai_test_auth');
  assert.equal(process.env.DATABASE_TEST_USER, 'skillswap_test_app');
  const database = createDatabase({ host: '127.0.0.1', port: 3306, database: process.env.DATABASE_TEST_DB,
    user: process.env.DATABASE_TEST_USER, password: process.env.DATABASE_TEST_PASSWORD });
  const suffix = randomBytes(8).toString('hex');
  const ids = { viewer: randomUUID(), mentorA: randomUUID(), mentorB: randomUUID(), pending: randomUUID(),
    admin: randomUUID(), career: randomUUID(), skills: [randomUUID(), randomUUID(), randomUUID()],
    offers: [randomUUID(), randomUUID(), randomUUID()], completed: randomUUID() };
  const protection = createSessionProtection(randomBytes(32).toString('hex'));
  const sessionRepository = createSessionRepository(database, sessionPolicy);
  const sessionService = createSessionService(sessionRepository, protection);
  const sessions = { viewer: protection.issue(), pending: protection.issue(), admin: protection.issue() };
  const studentService = createStudentService(createStudentRepository(database));
  const exploreService = createExploreService(createExploreRepository(database));
  let server;
  try {
    const [[identity]] = await database.execute('SELECT CURRENT_USER() account,DATABASE() db');
    assert.deepEqual(identity, { account: 'skillswap_test_app@127.0.0.1', db: 'skillswap_ai_test_auth' });
    await database.transaction(async tx => {
      await tx.execute('INSERT INTO careers (id,code,name) VALUES (?,?,?)',
        [ids.career, `EXPLORE_${suffix}`, `Explorar ${suffix}`]);
      await tx.execute('INSERT INTO career_cycles (career_id,cycle) VALUES (?,4)', [ids.career]);
      for (const [index, skillId] of ids.skills.entries()) await tx.execute(
        'INSERT INTO skill_catalog (id,code,name,category) VALUES (?,?,?,?)',
        [skillId, `explore-${suffix}-${index}`, `Habilidad explorar ${suffix} ${index}`,
          index < 2 ? `Categoria ${suffix}` : null]);
      for (const [id, firstName] of [[ids.viewer, 'Visor'], [ids.mentorA, 'Alfa'],
        [ids.mentorB, 'Beta'], [ids.pending, 'Pendiente']]) {
        await tx.execute(`INSERT INTO users (id,first_name,last_name,email,password_hash,role,status,email_verified_at,
          terms_accepted_at,terms_version,privacy_version) VALUES (?,?,?,?,?,'STUDENT','ACTIVE',UTC_TIMESTAMP(6),
          UTC_TIMESTAMP(6),'integration','integration')`,
        [id, firstName, `Aislado ${suffix}`, `${firstName.toLowerCase()}.${suffix}@tecsup.edu.pe`, dummyPasswordHash]);
        await tx.execute('INSERT INTO student_profiles (user_id,career_id,cycle,onboarding_complete) VALUES (?,?,4,TRUE)',
          [id, ids.career]);
        await tx.execute(`INSERT INTO student_profile_details
          (user_id,bio,learning_level,learning_goals,preferred_schedule) VALUES (?,?,?,?,?)`,
        [id, `Biografia pública ${firstName}`, `Nivel privado ${firstName}`,
          `Objetivo privado ${firstName}`, `Horario privado ${firstName}`]);
      }
      await tx.execute(`INSERT INTO users (id,first_name,last_name,email,password_hash,role,status,email_verified_at)
        VALUES (?,?,?,?,?,'ADMIN','ACTIVE',UTC_TIMESTAMP(6))`,
      [ids.admin, 'Admin', 'Aislado', `admin.${suffix}@example.test`, dummyPasswordHash]);
      await tx.execute("INSERT INTO student_skills (user_id,skill_id,intent) VALUES (?,?,'LEARN'),(?,?,'LEARN')",
        [ids.viewer, ids.skills[0], ids.viewer, ids.skills[1]]);
      const approved = async (userId, skillId) => tx.execute(`INSERT INTO mentor_applications
        (id,user_id,skill_id,status,decided_at,decided_by,decision_notes)
        VALUES (?,?,?,'APPROVED',UTC_TIMESTAMP(6),?,'Aprobación sintética')`,
      [randomUUID(), userId, skillId, ids.admin]);
      await approved(ids.mentorA, ids.skills[0]);
      await approved(ids.mentorB, ids.skills[0]);
      await approved(ids.mentorB, ids.skills[1]);
      await tx.execute(`INSERT INTO mentor_offers (id,mentor_user_id,skill_id,status) VALUES
        (?,?,?,'ACTIVE'),(?,?,?,'ACTIVE'),(?,?,?,'ACTIVE')`,
      [ids.offers[0], ids.mentorA, ids.skills[0], ids.offers[1], ids.mentorB, ids.skills[0],
        ids.offers[2], ids.mentorB, ids.skills[1]]);
      await tx.execute(`INSERT INTO mentor_availability (id,mentor_user_id,weekday,start_time,end_time) VALUES
        (?,?,MOD(WEEKDAY(DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 5 HOUR))+1,7)+1,'00:00:00','23:59:00'),
        (?,?,MOD(WEEKDAY(DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 5 HOUR))+1,7)+1,'00:00:00','23:59:00')`,
      [randomUUID(), ids.mentorA, randomUUID(), ids.mentorB]);
      await tx.execute(`INSERT INTO mentoring_sessions
        (id,request_key,student_user_id,mentor_user_id,offer_id,starts_at,ends_at,duration_minutes,credit_cost,status,
         started_at,performed_at,validated_at) VALUES (?,?,?,?,?,DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 2 HOUR),
         DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 90 MINUTE),30,5,'COMPLETED',DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 2 HOUR),
         DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 90 MINUTE),DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 90 MINUTE))`,
      [ids.completed, randomUUID(), ids.viewer, ids.mentorB, ids.offers[1]]);
      await tx.execute(`INSERT INTO session_reviews (session_id,reviewer_user_id,mentor_user_id,rating,comment)
        VALUES (?,?,?,?,?)`, [ids.completed, ids.viewer, ids.mentorB, 5, 'Valoración sintética aislada']);
      await tx.execute("INSERT INTO mentor_applications (id,user_id,skill_id,status) VALUES (?,?,?,'PENDING')",
        [randomUUID(), ids.pending, ids.skills[2]]);
    });
    await sessionRepository.create({ ...sessions.viewer, userId: ids.viewer, remember: false });
    await sessionRepository.create({ ...sessions.pending, userId: ids.pending, remember: false });
    await sessionRepository.create({ ...sessions.admin, userId: ids.admin, remember: false });
    const started = await listen(createApp({ database, origins: ['http://localhost:5173'], sessionService,
      studentService, exploreService, cookie: { name: sessionPolicy.cookieName } }));
    server = started.server;
    const auth = session => ({ Cookie: `${sessionPolicy.cookieName}=${session.token}` });

    assert.equal((await fetch(`${started.base}/api/student/explore/skills`)).status, 401);
    assert.equal((await fetch(`${started.base}/api/student/explore/mentors`, { headers: auth(sessions.admin) })).status, 403);
    const catalogResponse = await fetch(`${started.base}/api/student/explore/skills?q=${suffix}&category=${encodeURIComponent(`Categoria ${suffix}`)}`,
      { headers: auth(sessions.viewer) });
    assert.equal(catalogResponse.status, 200);
    const catalog = await catalogResponse.json();
    assert.equal(catalog.skills.length, 2);
    assert.deepEqual(catalog.categories, [`Categoria ${suffix}`]);

    const firstPage = await (await fetch(`${started.base}/api/student/explore/mentors?limit=1`,
      { headers: auth(sessions.viewer) })).json();
    assert.equal(firstPage.mentors.length, 1);
    assert.ok(firstPage.pagination.nextCursor);
    const secondPage = await (await fetch(`${started.base}/api/student/explore/mentors?limit=1&cursor=${firstPage.pagination.nextCursor}`,
      { headers: auth(sessions.viewer) })).json();
    assert.equal(secondPage.mentors.length, 1);
    const mentors = [...firstPage.mentors, ...secondPage.mentors];
    assert.deepEqual(mentors.map(mentor => mentor.id).sort(), [ids.mentorA, ids.mentorB].sort());
    assert.ok(!JSON.stringify(mentors).includes('@tecsup.edu.pe'));
    assert.ok(!JSON.stringify(mentors).includes('Horario privado'));
    assert.ok(!JSON.stringify(mentors).includes('Objetivo privado'));
    assert.ok(!JSON.stringify(mentors).includes('Aprobación sintética'));

    const filtered = await (await fetch(`${started.base}/api/student/explore/mentors?skillId=${ids.skills[1]}`,
      { headers: auth(sessions.viewer) })).json();
    assert.deepEqual(filtered.mentors.map(mentor => mentor.id), [ids.mentorB]);
    const byName = await (await fetch(`${started.base}/api/student/explore/mentors?q=Alfa`,
      { headers: auth(sessions.viewer) })).json();
    assert.deepEqual(byName.mentors.map(mentor => mentor.id), [ids.mentorA]);
    const detail = await (await fetch(`${started.base}/api/student/explore/mentors/${ids.mentorB}`,
      { headers: auth(sessions.viewer) })).json();
    assert.equal(detail.mentor.skills.length, 2);
    assert.deepEqual(Object.keys(detail.mentor).sort(), ['bio', 'career', 'cycle', 'firstName', 'id', 'lastName', 'skills'].sort());
    assert.equal((await fetch(`${started.base}/api/student/explore/mentors/${ids.pending}`,
      { headers: auth(sessions.viewer) })).status, 403);

    const recommendationResponses = await Promise.all(Array.from({ length: 4 }, () => fetch(
      `${started.base}/api/student/recommendations`, { headers: auth(sessions.viewer) }).then(response => response.json())));
    assert.ok(recommendationResponses.every(value => JSON.stringify(value) === JSON.stringify(recommendationResponses[0])));
    const recommendations = recommendationResponses[0];
    assert.equal(recommendations.rankingStatus, 'PARTIAL');
    assert.deepEqual(recommendations.weights, { skill: 45, level: 20, availability: 25, quality: 10 });
    assert.deepEqual(recommendations.recommendations.map(item => [item.mentor.id, item.score]),
      [[ids.mentorB, 80], [ids.mentorA, 47.5]]);
    assert.ok(recommendations.recommendations.every(item => item.components.availability.available === true &&
      item.components.level.available === false));
    assert.equal(recommendations.recommendations[0].components.quality.available, true);
    assert.equal(recommendations.recommendations[1].components.quality.available, false);
    const empty = await (await fetch(`${started.base}/api/student/recommendations`,
      { headers: auth(sessions.pending) })).json();
    assert.deepEqual({ status: empty.rankingStatus, items: empty.recommendations },
      { status: 'INSUFFICIENT_DATA', items: [] });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      await database.transaction(async tx => {
        await tx.execute('DELETE FROM session_reviews WHERE session_id=?', [ids.completed]);
        await tx.execute('DELETE FROM mentoring_sessions WHERE id=?', [ids.completed]);
        await tx.execute('DELETE FROM mentor_availability WHERE mentor_user_id IN (?,?)', [ids.mentorA, ids.mentorB]);
        await tx.execute('DELETE FROM mentor_offers WHERE mentor_user_id IN (?,?)', [ids.mentorA, ids.mentorB]);
        await tx.execute('DELETE FROM mentor_applications WHERE user_id IN (?,?,?)',
          [ids.mentorA, ids.mentorB, ids.pending]);
        await tx.execute('DELETE FROM student_skills WHERE user_id IN (?,?,?,?)',
          [ids.viewer, ids.mentorA, ids.mentorB, ids.pending]);
        await tx.execute('DELETE FROM auth_sessions WHERE user_id IN (?,?,?,?,?)',
          [ids.viewer, ids.mentorA, ids.mentorB, ids.pending, ids.admin]);
        await tx.execute('DELETE FROM student_profile_details WHERE user_id IN (?,?,?,?)',
          [ids.viewer, ids.mentorA, ids.mentorB, ids.pending]);
        await tx.execute('DELETE FROM student_profiles WHERE user_id IN (?,?,?,?)',
          [ids.viewer, ids.mentorA, ids.mentorB, ids.pending]);
        await tx.execute('DELETE FROM users WHERE id IN (?,?,?,?,?)',
          [ids.viewer, ids.mentorA, ids.mentorB, ids.pending, ids.admin]);
        await tx.execute('DELETE FROM career_cycles WHERE career_id=?', [ids.career]);
        await tx.execute('DELETE FROM careers WHERE id=?', [ids.career]);
        await tx.execute('DELETE FROM skill_catalog WHERE id IN (?,?,?)', ids.skills);
      });
    } finally { await database.close(); }
  }
});
