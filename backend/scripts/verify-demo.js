import dotenv from 'dotenv';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/config/db.js';
import { createAuthRepository } from '../src/modules/auth/auth.repository.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createEmailRepository } from '../src/modules/auth/email.repository.js';
import { createEmailService } from '../src/modules/auth/email.service.js';
import { createEmailRateRepository } from '../src/modules/auth/email-rate.repository.js';
import { createEmailVerificationRepository } from '../src/modules/auth/email-verification.repository.js';
import { createEmailVerificationService } from '../src/modules/auth/email-verification.service.js';
import { createCodeProtection, createRateIdentifier } from '../src/modules/auth/email-code.js';
import { otpPolicy } from '../src/modules/auth/email.policy.js';
import { createSessionProtection } from '../src/modules/auth/session-security.js';
import { createSessionRepository } from '../src/modules/auth/session.repository.js';
import { createSessionService } from '../src/modules/auth/session.service.js';
import { sessionPolicy } from '../src/config/session-security.js';
import { createStudentRepository } from '../src/modules/student/student.repository.js';
import { createStudentService } from '../src/modules/student/student.service.js';
import { createMentorRepository } from '../src/modules/student/mentor.repository.js';
import { createMentorService } from '../src/modules/student/mentor.service.js';
import { createExploreRepository } from '../src/modules/student/explore.repository.js';
import { createExploreService } from '../src/modules/student/explore.service.js';
import { createBookingRepository } from '../src/modules/student/booking.repository.js';
import { createBookingService } from '../src/modules/student/booking.service.js';

function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  return new Promise((resolvePromise, reject) => {
    server.once('listening', () => resolvePromise({ server,
      base: `http://127.0.0.1:${server.address().port}` }));
    server.once('error', reject);
  });
}

function nextOccurrence(slot) {
  const now = new Date();
  const local = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const currentWeekday = local.getUTCDay() || 7;
  let days = (Number(slot.weekday) - currentWeekday + 7) % 7;
  const [hour, minute] = String(slot.start).split(':').map(Number);
  let localTarget = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days, hour, minute);
  let target = new Date(localTarget + 5 * 60 * 60 * 1000);
  if (target.getTime() <= now.getTime() + 60000) {
    localTarget += 7 * 24 * 60 * 60 * 1000;
    target = new Date(localTarget + 5 * 60 * 60 * 1000);
  }
  return target.toISOString();
}

let database, server;
let userId, verificationId, rateIdentifier;
let stage = 'configuration';
try {
  const [envPath, ...extra] = process.argv.slice(2);
  if (!envPath || extra.length || process.env.DEMO_VERIFY_ALLOW_WRITE !== 'yes') throw new Error('Invalid arguments');
  const config = dotenv.config({ path: resolve(envPath), override: true, quiet: true }).parsed ?? {};
  if (config.DB_HOST !== '127.0.0.1' || config.DB_PORT !== '3306' ||
      config.DB_NAME !== 'skillswap_ai_demo' || config.DB_USER !== 'skillswap_demo_app' || !config.DB_PASSWORD) {
    throw new Error('Invalid demo verification configuration');
  }
  database = createDatabase({ host: config.DB_HOST, port: Number(config.DB_PORT), database: config.DB_NAME,
    user: config.DB_USER, password: config.DB_PASSWORD });
  const [[identity]] = await database.execute('SELECT CURRENT_USER() account,DATABASE() db');
  stage = 'schema';
  if (identity.account !== 'skillswap_demo_app@127.0.0.1' || identity.db !== 'skillswap_ai_demo') throw new Error('Wrong target');
  const [history] = await database.execute('SELECT version FROM schema_migrations ORDER BY version');
  if (history.length !== 8) throw new Error('Demo schema incomplete');

  const suffix = [...randomBytes(12)].map(value => String.fromCharCode(97 + (value % 26))).join('');
  const email = `temporary.${suffix}@tecsup.edu.pe`;
  stage = 'registration';
  const challengeKey = randomBytes(32).toString('hex');
  const rateKey = randomBytes(32).toString('hex');
  const protection = createCodeProtection({ keyHex: challengeKey, keyVersion: 'demo-verification-v1' });
  const identify = createRateIdentifier(rateKey);
  const delivered = new Map();
  const emailService = createEmailService({ repository: createEmailRepository(database),
    rateRepository: createEmailRateRepository(database), rateIdentifier(value) {
      rateIdentifier = identify(value); return rateIdentifier;
    }, protection, policy: otpPolicy, mailer: Object.freeze({
      async sendVerification(message) { delivered.set(message.to, message.code); }, close() {},
    }) });
  const auth = createAuthService(createAuthRepository(database));
  await auth.register({ firstName: 'Temporal', lastName: 'Validación', email,
    career: 'Diseño y Desarrollo de Software', cycle: 4,
    password: randomBytes(24).toString('base64url'), termsAccepted: true,
    termsVersion: '1.0.0', privacyVersion: '1.0.0' });
  const [[created]] = await database.execute('SELECT id FROM users WHERE email=?', [email]);
  userId = created.id;
  const request = await emailService.request({ email });
  stage = 'verification';
  verificationId = request.verificationId;
  await emailService.idle();
  const code = delivered.get(email);
  if (!code) throw new Error('Substituted delivery failed');
  await createEmailVerificationService(createEmailVerificationRepository(database), protection)
    .verify({ email, verificationId, code });
  await emailService.close();

  const studentService = createStudentService(createStudentRepository(database));
  stage = 'composition';
  const mentorService = createMentorService(createMentorRepository(database), Object.freeze({}));
  const exploreService = createExploreService(createExploreRepository(database, { levelsAvailable: true }));
  const bookingService = createBookingService(createBookingRepository(database));
  const [skills] = await database.execute(`SELECT id FROM skill_catalog WHERE code LIKE 'demo-%' ORDER BY code`);
  for (const skill of skills) await mentorService.setOwnSkill(userId, skill.id, { learning: true, teaching: false });

  const sessionProtection = createSessionProtection(randomBytes(32).toString('hex'));
  const sessionRepository = createSessionRepository(database, sessionPolicy);
  const sessionService = createSessionService(sessionRepository, sessionProtection);
  const session = sessionProtection.issue();
  await sessionRepository.create({ ...session, userId, remember: false });
  const started = await listen(createApp({ database, origins: ['http://localhost:5173'], sessionService,
    studentService, exploreService, bookingService, mentorService,
    cookie: { name: sessionPolicy.cookieName } }));
  server = started.server;
  stage = 'explore-http';
  const headers = { Cookie: `${sessionPolicy.cookieName}=${session.token}` };
  const mutation = { ...headers, Origin: 'http://localhost:5173', 'Content-Type': 'application/json',
    'X-CSRF-Token': session.csrfToken };
  const health = await fetch(`${started.base}/api/health`);
  const databaseHealth = await fetch(`${started.base}/api/health/db`);
  const catalogResponse = await fetch(`${started.base}/api/student/explore/skills`, { headers });
  const mentorsResponse = await fetch(`${started.base}/api/student/explore/mentors`, { headers });
  const recommendationsResponse = await fetch(`${started.base}/api/student/recommendations`, { headers });
  const catalog = await catalogResponse.json();
  const mentors = await mentorsResponse.json();
  const recommendations = await recommendationsResponse.json();
  if (health.status !== 200 || databaseHealth.status !== 200 || catalogResponse.status !== 200 ||
      mentorsResponse.status !== 200 || recommendationsResponse.status !== 200 ||
      mentors.mentors.length !== 3 || recommendations.recommendations.length !== 3) throw new Error('HTTP verification failed');

  const mentor = mentors.mentors[0];
  stage = 'booking-http';
  const offerId = (await database.execute(`SELECT id FROM mentor_offers WHERE mentor_user_id=? AND status='ACTIVE'`,
    [mentor.id]))[0][0].id;
  const availability = await (await fetch(`${started.base}/api/student/explore/mentors/${mentor.id}/availability`,
    { headers })).json();
  const startsAt = nextOccurrence(availability.availability.slots[0]);
  const requestId = randomUUID();
  const bookingBody = JSON.stringify({ requestId, offerId, startsAt, durationMinutes: 30 });
  const bookedResponse = await fetch(`${started.base}/api/student/bookings`,
    { method: 'POST', headers: mutation, body: bookingBody });
  const booked = await bookedResponse.json();
  const duplicateResponse = await fetch(`${started.base}/api/student/bookings`,
    { method: 'POST', headers: mutation, body: bookingBody });
  const held = await (await fetch(`${started.base}/api/student/session-credits`, { headers })).json();
  const cancellations = await Promise.all([0, 1].map(() => fetch(
    `${started.base}/api/student/sessions/${booked.session.id}/cancel`,
    { method: 'POST', headers: mutation, body: '{}' })));
  const refunded = await (await fetch(`${started.base}/api/student/session-credits`, { headers })).json();
  if (bookedResponse.status !== 201 || duplicateResponse.status !== 201 ||
      cancellations.some(response => response.status !== 200) || held.credits.held !== 5 ||
      held.credits.available !== 15 || refunded.credits.held !== 0 || refunded.credits.available !== 20) {
    throw new Error('Booking accounting verification failed');
  }
  console.info(JSON.stringify({ identity: identity.account, migrations: history.length,
    http: { health: health.status, database: databaseHealth.status, catalog: catalogResponse.status,
      mentors: mentorsResponse.status, recommendations: recommendationsResponse.status,
      booking: bookedResponse.status, duplicate: duplicateResponse.status,
      cancellations: cancellations.map(response => response.status) },
    data: { catalogSkills: catalog.skills.length, mentors: mentors.mentors.length,
      recommendations: recommendations.recommendations.length, rankingStatus: recommendations.rankingStatus },
    credits: { held: held.credits, refunded: refunded.credits } }));
} catch (error) {
  const code = /^[A-Z0-9_]+$/.test(error?.code ?? '') ? error.code : 'CHECK_FAILED';
  console.error(`Demo operational verification failed at ${stage} (${code}); no credentials or private identifiers exposed.`);
  process.exitCode = 1;
} finally {
  if (server) await new Promise(resolvePromise => server.close(resolvePromise));
  if (database && userId) {
    try {
      await database.transaction(async tx => {
        await tx.execute(`DELETE r FROM session_reviews r JOIN mentoring_sessions s ON s.id=r.session_id
          WHERE s.student_user_id=?`, [userId]);
        await tx.execute(`DELETE e FROM mentoring_session_events e JOIN mentoring_sessions s ON s.id=e.session_id
          WHERE s.student_user_id=?`, [userId]);
        await tx.execute(`DELETE h FROM session_credit_holds h JOIN mentoring_sessions s ON s.id=h.session_id
          WHERE s.student_user_id=?`, [userId]);
        await tx.execute('DELETE FROM mentoring_sessions WHERE student_user_id=?', [userId]);
        await tx.execute('DELETE FROM auth_sessions WHERE user_id=?', [userId]);
        await tx.execute('DELETE FROM student_skills WHERE user_id=?', [userId]);
        await tx.execute('DELETE FROM credit_transactions WHERE user_id=?', [userId]);
        await tx.execute('DELETE FROM email_verifications WHERE user_id=?', [userId]);
        await tx.execute('DELETE FROM student_profiles WHERE user_id=?', [userId]);
        if (rateIdentifier) await tx.execute('DELETE FROM otp_request_limits WHERE email_hmac=?', [rateIdentifier]);
        await tx.execute('DELETE FROM users WHERE id=?', [userId]);
      });
    } catch { process.exitCode = 1; }
  }
  await database?.close();
}
