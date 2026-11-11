import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../src/app.js';
import { createLocalPrivateStorage } from '../src/adapters/private-storage.js';
import { createDatabase } from '../src/config/db.js';
import { sessionPolicy } from '../src/config/session-security.js';
import { dummyPasswordHash } from '../src/modules/auth/password.service.js';
import { createSessionRepository } from '../src/modules/auth/session.repository.js';
import { createSessionProtection } from '../src/modules/auth/session-security.js';
import { createSessionService } from '../src/modules/auth/session.service.js';
import { createMentorRepository } from '../src/modules/student/mentor.repository.js';
import { createMentorService } from '../src/modules/student/mentor.service.js';
import { createStudentRepository } from '../src/modules/student/student.repository.js';
import { createStudentService } from '../src/modules/student/student.service.js';

const requested = Object.keys(process.env).some(key => key.startsWith('DATABASE_TEST_'));
const origin = 'http://localhost:5173';
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
const pdf2 = Buffer.from('%PDF-1.5\n2 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('0000000d49484452', 'hex'),
  Buffer.alloc(17), Buffer.from('0000000049454e4400000000', 'hex')]);
png.writeUInt32BE(1, 16); png.writeUInt32BE(1, 20);
const jpeg = Buffer.from('ffd8ffe000040000ffc000070800010001ffd9', 'hex');
const webp = Buffer.alloc(30); webp.write('RIFF'); webp.writeUInt32LE(22, 4); webp.write('WEBP', 8); webp.write('VP8X', 12);

function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  return new Promise((resolve, reject) => {
    server.once('listening', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
    server.once('error', reject);
  });
}

function multipart(fields, files) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  for (const [name, value] of Object.entries(files)) form.set(name,
    new Blob([value.buffer], { type: value.type }), value.name);
  return form;
}

async function objectFiles(root) {
  const objects = join(root, 'objects');
  try {
    const prefixes = await readdir(objects);
    const nested = await Promise.all(prefixes.map(async prefix => (await readdir(join(objects, prefix)))
      .map(name => join(prefix, name))));
    return nested.flat().sort();
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

test('real isolated mentor HTTP persists skills, applications and private files with ownership and compensation', {
  skip: requested ? false : '006 isolated HTTP integration pending', timeout: 60000,
}, async () => {
  assert.equal(process.env.DATABASE_TEST_DB, 'skillswap_ai_test_auth');
  assert.equal(process.env.DATABASE_TEST_USER, 'skillswap_test_app');
  const database = createDatabase({ host: '127.0.0.1', port: 3306, database: process.env.DATABASE_TEST_DB,
    user: process.env.DATABASE_TEST_USER, password: process.env.DATABASE_TEST_PASSWORD });
  const ids = { student: randomUUID(), other: randomUUID(), admin: randomUUID(), career: randomUUID(),
    skills: [randomUUID(), randomUUID(), randomUUID(), randomUUID()] };
  const suffix = randomBytes(8).toString('hex');
  const storageRoot = await mkdtemp(join(tmpdir(), 'skillswap-private-'));
  const storage = createLocalPrivateStorage({ root: storageRoot });
  const protection = createSessionProtection(randomBytes(32).toString('hex'));
  const sessionRepository = createSessionRepository(database, sessionPolicy);
  const sessionService = createSessionService(sessionRepository, protection);
  const studentService = createStudentService(createStudentRepository(database));
  const mentorRepository = createMentorRepository(database);
  const cleanupEvents = [];
  const mentorService = createMentorService(mentorRepository, storage,
    { onCleanupFailure: event => cleanupEvents.push(event) });
  const sessions = { student: protection.issue(), other: protection.issue(), admin: protection.issue() };
  let server;
  try {
    const [[identity]] = await database.execute('SELECT CURRENT_USER() account,DATABASE() db');
    assert.deepEqual(identity, { account: 'skillswap_test_app@127.0.0.1', db: 'skillswap_ai_test_auth' });
    await database.transaction(async tx => {
      await tx.execute('INSERT INTO careers (id,code,name) VALUES (?,?,?)',
        [ids.career, `MENTOR_HTTP_${suffix}`, `Mentor HTTP ${suffix}`]);
      await tx.execute('INSERT INTO career_cycles (career_id,cycle) VALUES (?,3)', [ids.career]);
      for (const [index, id] of ids.skills.entries()) await tx.execute(
        'INSERT INTO skill_catalog (id,code,name,category) VALUES (?,?,?,?)',
        [id, `skill-${suffix}-${index}`, `Habilidad ${suffix} ${index}`, index ? null : 'Integración']);
      for (const [id, label] of [[ids.student, 'Mentor'], [ids.other, 'Otro']]) {
        await tx.execute(`INSERT INTO users (id,first_name,last_name,email,password_hash,role,status,email_verified_at,
          terms_accepted_at,terms_version,privacy_version) VALUES (?,?,?,?,?,'STUDENT','ACTIVE',UTC_TIMESTAMP(6),
          UTC_TIMESTAMP(6),'integration','integration')`,
        [id, label, 'Aislado', `${label.toLowerCase()}.${suffix}@tecsup.edu.pe`, dummyPasswordHash]);
        await tx.execute('INSERT INTO student_profiles (user_id,career_id,cycle) VALUES (?,?,3)', [id, ids.career]);
      }
      await tx.execute(`INSERT INTO users (id,first_name,last_name,email,password_hash,role,status,email_verified_at)
        VALUES (?,?,?,?,?,'ADMIN','ACTIVE',UTC_TIMESTAMP(6))`,
      [ids.admin, 'Admin', 'Aislado', `admin.${suffix}@example.test`, dummyPasswordHash]);
    });
    await sessionRepository.create({ ...sessions.student, userId: ids.student, remember: false });
    await sessionRepository.create({ ...sessions.other, userId: ids.other, remember: false });
    await sessionRepository.create({ ...sessions.admin, userId: ids.admin, remember: false });
    const started = await listen(createApp({ database, origins: [origin], sessionService, studentService,
      mentorService, cookie: { name: sessionPolicy.cookieName } }));
    server = started.server;
    const auth = session => ({ Cookie: `${sessionPolicy.cookieName}=${session.token}` });
    const mutate = session => ({ ...auth(session), Origin: origin, 'X-CSRF-Token': session.csrfToken });

    const catalog = await (await fetch(`${started.base}/api/student/skills/catalog`,
      { headers: auth(sessions.student) })).json();
    assert.deepEqual(catalog.skills.map(skill => skill.id).sort(), [...ids.skills].sort());
    assert.equal((await fetch(`${started.base}/api/student/skills/${ids.skills[0]}`, { method: 'PUT',
      headers: { ...mutate(sessions.student), 'Content-Type': 'application/json' },
      body: JSON.stringify({ learning: true, teaching: true }) })).status, 200);
    const ownSkills = await (await fetch(`${started.base}/api/student/skills`,
      { headers: auth(sessions.student) })).json();
    assert.deepEqual(ownSkills.skills[0], { id: ids.skills[0], code: `skill-${suffix}-0`,
      name: `Habilidad ${suffix} 0`, category: 'Integración', learning: true, teaching: true,
      approvedToMentor: false });
    assert.equal((await fetch(`${started.base}/api/student/skills/${ids.skills[0]}`, { method: 'PUT',
      headers: { ...auth(sessions.student), Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ learning: false, teaching: true }) })).status, 403);
    assert.equal((await fetch(`${started.base}/api/student/skills`, { headers: auth(sessions.admin) })).status, 403);

    const missing = multipart({ skillId: ids.skills[0] }, {});
    assert.equal((await fetch(`${started.base}/api/student/mentor-applications`, { method: 'POST',
      headers: mutate(sessions.student), body: missing })).status, 422);
    const invalid = Buffer.from('%PDF-1.4\n1 0 obj\n/JavaScript\nendobj\n%%EOF');
    assert.equal((await fetch(`${started.base}/api/student/mentor-applications`, { method: 'POST',
      headers: mutate(sessions.student), body: multipart({ skillId: ids.skills[0] }, { certificate: {
        buffer: invalid, type: 'application/pdf', name: 'activo.pdf' } }) })).status, 422);
    const applicationResponse = await fetch(`${started.base}/api/student/mentor-applications`, { method: 'POST',
      headers: mutate(sessions.student), body: multipart({ skillId: ids.skills[0],
        portfolioUrl: 'https://portfolio.example/aislado' }, { certificate: {
        buffer: pdf, type: 'application/pdf', name: 'certificado.pdf' } }) });
    assert.equal(applicationResponse.status, 201);
    const application = (await applicationResponse.json()).application;
    assert.equal(application.status, 'PENDING');
    assert.equal(application.portfolioUrl, 'https://portfolio.example/aislado');
    assert.equal((await fetch(`${started.base}/api/student/mentor-applications/${application.id}/documents/certificate`,
      { headers: auth(sessions.student) })).status, 200);
    assert.equal((await fetch(`${started.base}/api/student/mentor-applications/${application.id}/documents/certificate`,
      { headers: auth(sessions.other) })).status, 403);

    const beforeReplace = await database.execute(`SELECT f.storage_key FROM mentor_application_documents d
      JOIN private_files f ON f.id=d.file_id WHERE d.application_id=? AND d.document_type='CERTIFICATE'`, [application.id]);
    assert.equal((await fetch(`${started.base}/api/student/mentor-applications/${application.id}/certificate`, {
      method: 'PUT', headers: mutate(sessions.student), body: multipart({}, { certificate: {
        buffer: pdf2, type: 'application/pdf', name: 'nuevo.pdf' } }) })).status, 200);
    assert.ok(!(await objectFiles(storageRoot)).includes(join(beforeReplace[0][0].storage_key.slice(0, 2),
      beforeReplace[0][0].storage_key)));

    await database.execute(`UPDATE mentor_applications SET status='REJECTED',decided_at=UTC_TIMESTAMP(6),
      decided_by=?,decision_notes='Fixture aislada' WHERE id=?`, [ids.admin, application.id]);
    assert.equal((await fetch(`${started.base}/api/student/mentor-applications/${application.id}/resubmit`, {
      method: 'POST', headers: { ...mutate(sessions.student), 'Content-Type': 'application/json' }, body: '{}' })).status, 200);
    await database.execute(`UPDATE mentor_applications SET status='APPROVED',decided_at=UTC_TIMESTAMP(6),
      decided_by=?,decision_notes='Fixture aislada' WHERE id=?`, [ids.admin, application.id]);
    const fileCountBeforeBlocked = Number((await database.execute('SELECT COUNT(*) count FROM private_files WHERE owner_user_id=?',
      [ids.student]))[0][0].count);
    assert.equal((await fetch(`${started.base}/api/student/mentor-applications/${application.id}/certificate`, {
      method: 'PUT', headers: mutate(sessions.student), body: multipart({}, { certificate: {
        buffer: pdf, type: 'application/pdf', name: 'bloqueado.pdf' } }) })).status, 409);
    assert.equal(Number((await database.execute('SELECT COUNT(*) count FROM private_files WHERE owner_user_id=?',
      [ids.student]))[0][0].count), fileCountBeforeBlocked);

    for (const [buffer, type, name] of [[png, 'image/png', 'foto.png'], [jpeg, 'image/jpeg', 'foto.jpg'],
      [webp, 'image/webp', 'foto.webp']]) {
      assert.equal((await fetch(`${started.base}/api/student/profile/photo`, { method: 'PUT',
        headers: mutate(sessions.student), body: multipart({}, { photo: { buffer, type, name } }) })).status, 200);
    }
    const photo = await fetch(`${started.base}/api/student/profile/photo`, { headers: auth(sessions.student) });
    assert.equal(photo.status, 200); assert.equal(photo.headers.get('content-type'), 'image/webp');
    assert.equal((await fetch(`${started.base}/api/student/profile/photo`, { headers: auth(sessions.other) })).status, 403);
    assert.equal((await fetch(`${started.base}/api/student/profile/photo`, { method: 'DELETE',
      headers: mutate(sessions.student) })).status, 200);

    const portfolioResponse = await fetch(`${started.base}/api/student/mentor-applications`, { method: 'POST',
      headers: mutate(sessions.student), body: multipart({ skillId: ids.skills[1] }, {
        certificate: { buffer: pdf, type: 'application/pdf', name: 'certificado.pdf' },
        portfolio: { buffer: pdf2, type: 'application/pdf', name: 'portafolio.pdf' } }) });
    assert.equal(portfolioResponse.status, 201);
    const portfolioApplication = (await portfolioResponse.json()).application;
    assert.equal(portfolioApplication.portfolioAttached, true);
    assert.equal((await fetch(`${started.base}/api/student/mentor-applications/${portfolioApplication.id}/documents/portfolio`,
      { headers: auth(sessions.student) })).status, 200);

    const [[cleanupTarget]] = await database.execute(`SELECT f.storage_key FROM mentor_application_documents d
      JOIN private_files f ON f.id=d.file_id WHERE d.application_id=? AND d.document_type='CERTIFICATE'`,
    [portfolioApplication.id]);
    const pendingCleanupEvents = [];
    const cleanupStorage = { store: storage.store, read: storage.read,
      async remove(key) { if (key === cleanupTarget.storage_key) throw new Error('Synthetic cleanup failure');
        return storage.remove(key); } };
    const cleanupService = createMentorService(mentorRepository, cleanupStorage,
      { onCleanupFailure: event => pendingCleanupEvents.push(event) });
    await cleanupService.replaceCertificate(ids.student, portfolioApplication.id, { fields: {}, files: {
      certificate: { buffer: pdf2, mediaType: 'application/pdf' } } });
    assert.deepEqual(pendingCleanupEvents, ['PRIVATE_FILE_CLEANUP_REQUIRED']);
    assert.equal((await objectFiles(storageRoot)).some(path => path.endsWith(cleanupTarget.storage_key)), true);
    await storage.remove(cleanupTarget.storage_key);

    assert.equal((await fetch(`${started.base}/api/student/profile/photo`, { method: 'PUT',
      headers: mutate(sessions.student), body: multipart({}, { photo: {
        buffer: Buffer.from('not-an-image'), type: 'image/png', name: 'invalida.png' } }) })).status, 422);

    const concurrent = await Promise.all([0, 1].map(() => fetch(`${started.base}/api/student/mentor-applications`, {
      method: 'POST', headers: mutate(sessions.student), body: multipart({ skillId: ids.skills[2] }, { certificate: {
        buffer: pdf, type: 'application/pdf', name: 'concurrente.pdf' } }) })));
    assert.deepEqual(concurrent.map(response => response.status).sort(), [201, 409]);
    const [[counts]] = await database.execute(`SELECT
      (SELECT COUNT(*) FROM mentor_applications WHERE user_id=? AND skill_id=?) applications,
      (SELECT COUNT(*) FROM mentor_application_events e JOIN mentor_applications a ON a.id=e.application_id
        WHERE a.user_id=? AND a.skill_id=? AND e.event_type='SUBMITTED') events`,
    [ids.student, ids.skills[2], ids.student, ids.skills[2]]);
    assert.deepEqual({ applications: Number(counts.applications), events: Number(counts.events) },
      { applications: 1, events: 1 });

    const beforeRollbackRows = Number((await database.execute('SELECT COUNT(*) count FROM private_files WHERE owner_user_id=?',
      [ids.student]))[0][0].count);
    const beforeRollbackFiles = await objectFiles(storageRoot);
    const faultDatabase = { execute: database.execute.bind(database), async transaction(callback) {
      return database.transaction(async tx => callback({ async execute(sql, values) {
        const result = await tx.execute(sql, values);
        if (sql.startsWith('INSERT INTO private_files')) throw new Error('Synthetic SQL failure after insert');
        return result;
      } }));
    } };
    const faultService = createMentorService(createMentorRepository(faultDatabase), storage);
    await assert.rejects(faultService.createApplication(ids.student, { fields: { skillId: ids.skills[3] }, files: {
      certificate: { buffer: pdf, mediaType: 'application/pdf' } } }), /Synthetic SQL failure/);
    assert.equal(Number((await database.execute('SELECT COUNT(*) count FROM private_files WHERE owner_user_id=?',
      [ids.student]))[0][0].count), beforeRollbackRows);
    assert.deepEqual(await objectFiles(storageRoot), beforeRollbackFiles);
    assert.deepEqual(cleanupEvents, []);
    const [[readyFiles]] = await database.execute(`SELECT COUNT(*) count FROM private_files
      WHERE owner_user_id=? AND status='READY'`, [ids.student]);
    assert.equal((await objectFiles(storageRoot)).length, Number(readyFiles.count));
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      await database.transaction(async tx => {
        await tx.execute(`DELETE e FROM mentor_application_events e JOIN mentor_applications a
          ON a.id=e.application_id WHERE a.user_id IN (?,?)`, [ids.student, ids.other]);
        await tx.execute(`DELETE d FROM mentor_application_documents d JOIN mentor_applications a
          ON a.id=d.application_id WHERE a.user_id IN (?,?)`, [ids.student, ids.other]);
        await tx.execute('DELETE FROM mentor_applications WHERE user_id IN (?,?)', [ids.student, ids.other]);
        await tx.execute('DELETE FROM student_profile_photos WHERE user_id IN (?,?)', [ids.student, ids.other]);
        await tx.execute('DELETE FROM private_files WHERE owner_user_id IN (?,?)', [ids.student, ids.other]);
        await tx.execute('DELETE FROM student_skills WHERE user_id IN (?,?)', [ids.student, ids.other]);
        await tx.execute('DELETE FROM auth_sessions WHERE user_id IN (?,?,?)', [ids.student, ids.other, ids.admin]);
        await tx.execute('DELETE FROM student_profiles WHERE user_id IN (?,?)', [ids.student, ids.other]);
        await tx.execute('DELETE FROM users WHERE id IN (?,?,?)', [ids.student, ids.other, ids.admin]);
        await tx.execute('DELETE FROM career_cycles WHERE career_id=?', [ids.career]);
        await tx.execute('DELETE FROM careers WHERE id=?', [ids.career]);
        await tx.execute('DELETE FROM skill_catalog WHERE id IN (?,?,?,?)', ids.skills);
      });
    } finally { await database.close(); await rm(storageRoot, { recursive: true, force: true }); }
  }
});
