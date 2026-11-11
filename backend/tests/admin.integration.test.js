import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { synchronizeAcademicCatalog, readAcademicCatalog } from '../database/academic-catalog.js';
import { readDemoMentors } from '../database/demo-mentors.js';
import { readLevelCatalog, synchronizeLevelCatalog } from '../database/level-catalog.js';
import { readSkillCatalog, synchronizeSkillCatalog } from '../database/skill-catalog.js';
import { createLocalPrivateStorage } from '../src/adapters/private-storage.js';
import { createDatabase } from '../src/config/db.js';
import { dummyPasswordHash } from '../src/modules/auth/password.service.js';
import { createAdminRepository } from '../src/modules/admin/admin.repository.js';
import { createAdminService } from '../src/modules/admin/admin.service.js';
import { createBookingRepository } from '../src/modules/student/booking.repository.js';
import { createBookingService } from '../src/modules/student/booking.service.js';
import { createExploreRepository } from '../src/modules/student/explore.repository.js';
import { createExploreService } from '../src/modules/student/explore.service.js';
import { createMentorRepository } from '../src/modules/student/mentor.repository.js';
import { createMentorService } from '../src/modules/student/mentor.service.js';
import { createPrivateFileReader } from '../src/modules/student/private-file-reader.js';

const requested = Object.keys(process.env).some(key => key.startsWith('DATABASE_TEST_'));
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Subject (EVIDENCIA ACADEMICA FICTICIA - SOLO DEMOSTRACION) >>\nendobj\n%%EOF');
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('0000000d49484452', 'hex'),
  Buffer.alloc(17), Buffer.from('0000000049454e4400000000', 'hex')]);
png.writeUInt32BE(1, 16); png.writeUInt32BE(1, 20);

test('real isolated ADMIN flow approves three synthetic mentors, audits levels and enables deterministic recommendations', {
  skip: requested ? false : '008 isolated ADMIN integration pending', timeout: 90000,
}, async () => {
  assert.equal(process.env.DATABASE_TEST_DB, 'skillswap_ai_test_auth');
  assert.equal(process.env.DATABASE_TEST_USER, 'skillswap_test_app');
  const database = createDatabase({ host: '127.0.0.1', port: 3306, database: process.env.DATABASE_TEST_DB,
    user: process.env.DATABASE_TEST_USER, password: process.env.DATABASE_TEST_PASSWORD });
  const storageRoot = await mkdtemp(join(tmpdir(), 'skillswap-admin-demo-'));
  const storage = createLocalPrivateStorage({ root: storageRoot });
  const adminId = randomUUID(), viewerId = randomUUID(), suffix = randomBytes(7).toString('hex');
  const users = [], applications = [], offerIds = [];
  const academic = await readAcademicCatalog();
  const manifest = await readDemoMentors();
  const skillCatalog = await readSkillCatalog(new URL('../database/catalogs/demo-skills-1.0.0.json', import.meta.url));
  const levelCatalog = await readLevelCatalog(new URL('../database/catalogs/demo-levels-1.0.0.json', import.meta.url));
  const mentorService = createMentorService(createMentorRepository(database), storage);
  const adminService = createAdminService(createAdminRepository(database), createPrivateFileReader(storage));
  const bookingService = createBookingService(createBookingRepository(database));
  const exploreService = createExploreService(createExploreRepository(database, { levelsAvailable: true }));
  let insertedCareerIds = [], insertedSkillIds = [], insertedLevelCodes = [];
  try {
    const [[identity]] = await database.execute('SELECT CURRENT_USER() account,DATABASE() db');
    assert.deepEqual(identity, { account: 'skillswap_test_app@127.0.0.1', db: 'skillswap_ai_test_auth' });
    const [[migration]] = await database.execute(`SELECT checksum FROM schema_migrations
      WHERE version='008_mentor_skill_levels'`);
    assert.equal(String(migration.checksum).toLowerCase(), '9f1cdc5fa257d9c2695bb4bc72a86566b26b7198ba5187f47f78a96083579cae');
    const [existingCareers] = await database.execute(`SELECT id FROM careers WHERE id IN
      (${academic.careers.map(() => '?').join(',')})`, academic.careers.map(item => item.id));
    insertedCareerIds = academic.careers.map(item => item.id).filter(id => !existingCareers.some(row => row.id === id));
    const [existingSkills] = await database.execute(`SELECT id FROM skill_catalog WHERE id IN
      (${skillCatalog.skills.map(() => '?').join(',')})`, skillCatalog.skills.map(item => item.id));
    insertedSkillIds = skillCatalog.skills.map(item => item.id).filter(id => !existingSkills.some(row => row.id === id));
    const [existingLevels] = await database.execute(`SELECT code FROM skill_level_catalog WHERE code IN
      (${levelCatalog.levels.map(() => '?').join(',')})`, levelCatalog.levels.map(item => item.code));
    insertedLevelCodes = levelCatalog.levels.map(item => item.code).filter(code => !existingLevels.some(row => row.code === code));
    await synchronizeAcademicCatalog(database, { apply: true });
    assert.equal((await synchronizeAcademicCatalog(database, { apply: true })).missingCycles, 0);
    const appliedSkills = await synchronizeSkillCatalog(database, skillCatalog, { apply: true });
    assert.equal(appliedSkills.missing, insertedSkillIds.length);
    const repeatedSkills = await synchronizeSkillCatalog(database, skillCatalog, { apply: true });
    assert.equal(repeatedSkills.missing, 0);
    const appliedLevels = await synchronizeLevelCatalog(database, levelCatalog, { apply: true });
    assert.equal(appliedLevels.missing, insertedLevelCodes.length);
    assert.equal((await synchronizeLevelCatalog(database, levelCatalog, { apply: true })).missing, 0);

    await database.execute(`INSERT INTO users (id,first_name,last_name,email,password_hash,role,status,email_verified_at)
      VALUES (?,?,?,?,?,'ADMIN','ACTIVE',UTC_TIMESTAMP(6))`,
    [adminId, 'Administración', 'Aislada', `admin.${suffix}@example.test`, dummyPasswordHash]);
    const viewerCareer = academic.careers.find(item => item.code === 'software');
    await database.transaction(async tx => {
      await tx.execute(`INSERT INTO users (id,first_name,last_name,email,password_hash,role,status,email_verified_at,
        terms_accepted_at,terms_version,privacy_version) VALUES (?,?,?,?,?,'STUDENT','ACTIVE',UTC_TIMESTAMP(6),
        UTC_TIMESTAMP(6),'demo','demo')`,
      [viewerId, 'Visor', 'Demostración', `visor.${suffix}@tecsup.edu.pe`, dummyPasswordHash]);
      await tx.execute(`INSERT INTO student_profiles (user_id,career_id,cycle,onboarding_complete)
        VALUES (?,?,4,TRUE)`, [viewerId, viewerCareer.id]);
      for (const mentor of manifest.mentors) {
        const id = randomUUID(); users.push({ ...mentor, id });
        const career = academic.careers.find(item => item.code === mentor.careerCode);
        await tx.execute(`INSERT INTO users (id,first_name,last_name,email,password_hash,role,status,email_verified_at,
          terms_accepted_at,terms_version,privacy_version) VALUES (?,?,?,?,?,'STUDENT','ACTIVE',UTC_TIMESTAMP(6),
          UTC_TIMESTAMP(6),'demo','demo')`,
        [id, mentor.firstName, mentor.lastName, `demo.${mentor.key}.${suffix}@tecsup.edu.pe`, dummyPasswordHash]);
        await tx.execute(`INSERT INTO student_profiles (user_id,career_id,cycle,onboarding_complete)
          VALUES (?,?,?,TRUE)`, [id, career.id, mentor.cycle]);
        await tx.execute(`INSERT INTO student_profile_details (user_id,bio,learning_level,preferred_schedule)
          VALUES (?,?,?,?)`, [id, mentor.bio, 'Dato ficticio de demostración', 'Disponibilidad estructurada']);
      }
      for (const skill of skillCatalog.skills) await tx.execute(
        "INSERT INTO student_skills (user_id,skill_id,intent) VALUES (?,?,'LEARN')", [viewerId, skill.id]);
    });

    for (const mentor of users) {
      const skill = skillCatalog.skills.find(item => item.code === mentor.skillCode);
      await mentorService.savePhoto(mentor.id, { fields: {}, files: {
        photo: { buffer: png, mediaType: 'image/png' },
      } });
      const created = await mentorService.createApplication(mentor.id, { fields: { skillId: skill.id }, files: {
        certificate: { buffer: pdf, mediaType: 'application/pdf' },
      } });
      applications.push({ ...created, mentor });
    }
    const rejected = await mentorService.createApplication(users[0].id, {
      fields: { skillId: skillCatalog.skills[1].id }, files: {
        certificate: { buffer: pdf, mediaType: 'application/pdf' },
      },
    });
    assert.equal((await adminService.pending({ limit: '10' })).length, 4);
    const downloaded = await adminService.document(applications[0].id, 'certificate');
    assert.ok(downloaded.buffer.includes(Buffer.from('EVIDENCIA ACADEMICA FICTICIA')));
    await assert.rejects(adminService.decide(users[0].id, applications[0].id,
      { decision: 'APPROVED', reason: 'Autoaprobación prohibida.' }), error => error.code === 'FORBIDDEN');

    const concurrent = await Promise.allSettled([0, 1].map(() => adminService.decide(adminId,
      applications[0].id, { decision: 'APPROVED', reason: 'Evidencia ficticia revisada.' })));
    assert.deepEqual(concurrent.map(item => item.status).sort(), ['fulfilled', 'rejected']);
    assert.equal(concurrent.find(item => item.status === 'rejected').reason.code, 'CONFLICT');
    for (const item of applications.slice(1)) await adminService.decide(adminId, item.id,
      { decision: 'APPROVED', reason: 'Evidencia ficticia revisada.' });
    await adminService.decide(adminId, rejected.id,
      { decision: 'REJECTED', reason: 'Solicitud ficticia duplicada para comprobar el rechazo.' });
    assert.deepEqual(await adminService.pending({ limit: '10' }), []);

    for (const mentor of users) {
      const skill = skillCatalog.skills.find(item => item.code === mentor.skillCode);
      const offer = await bookingService.setOffer(mentor.id, skill.id, { active: true });
      offerIds.push(offer.id);
      await bookingService.replaceAvailability(mentor.id, { slots: mentor.availability });
      const assignments = await Promise.all([0, 1].map(() => adminService.assignLevel(adminId, offer.id,
        { levelCode: mentor.levelCode })));
      assert.deepEqual(assignments[0], assignments[1]);
    }
    const recommendations = await Promise.all([0, 1, 2].map(() => exploreService.recommendations(viewerId, {})));
    assert.ok(recommendations.every(item => JSON.stringify(item) === JSON.stringify(recommendations[0])));
    assert.equal(recommendations[0].recommendations.length, 3);
    assert.equal(recommendations[0].rankingStatus, 'PARTIAL');
    assert.deepEqual(recommendations[0].missingSignals, ['quality']);
    assert.ok(recommendations[0].recommendations.every(item => item.components.level.available &&
      item.components.availability.available && !item.components.quality.available));
    const [[audit]] = await database.execute(`SELECT
      (SELECT COUNT(*) FROM mentor_application_events WHERE event_type='APPROVED' AND actor_user_id=?) approvals,
      (SELECT COUNT(*) FROM mentor_application_events WHERE event_type='REJECTED' AND actor_user_id=?) rejections,
      (SELECT COUNT(*) FROM mentor_skill_levels WHERE assigned_by=?) levels`, [adminId, adminId, adminId]);
    assert.deepEqual({ approvals: Number(audit.approvals), rejections: Number(audit.rejections),
      levels: Number(audit.levels) }, { approvals: 3, rejections: 1, levels: 3 });
  } finally {
    try {
      await database.transaction(async tx => {
        await tx.execute('DELETE FROM mentor_skill_levels WHERE assigned_by=?', [adminId]);
        await tx.execute(`DELETE FROM mentor_availability WHERE mentor_user_id IN (${users.map(() => '?').join(',') || "''"})`,
          users.map(item => item.id));
        await tx.execute(`DELETE FROM mentor_offers WHERE mentor_user_id IN (${users.map(() => '?').join(',') || "''"})`,
          users.map(item => item.id));
        await tx.execute(`DELETE e FROM mentor_application_events e JOIN mentor_applications a ON a.id=e.application_id
          WHERE a.user_id IN (${users.map(() => '?').join(',') || "''"})`, users.map(item => item.id));
        await tx.execute(`DELETE d FROM mentor_application_documents d JOIN mentor_applications a ON a.id=d.application_id
          WHERE a.user_id IN (${users.map(() => '?').join(',') || "''"})`, users.map(item => item.id));
        await tx.execute(`DELETE FROM mentor_applications WHERE user_id IN (${users.map(() => '?').join(',') || "''"})`,
          users.map(item => item.id));
        await tx.execute(`DELETE FROM student_profile_photos WHERE user_id IN (${users.map(() => '?').join(',') || "''"})`,
          users.map(item => item.id));
        await tx.execute(`DELETE FROM private_files WHERE owner_user_id IN (${users.map(() => '?').join(',') || "''"})`,
          users.map(item => item.id));
        await tx.execute(`DELETE FROM student_skills WHERE user_id IN (${[viewerId, ...users.map(item => item.id)].map(() => '?').join(',')})`,
          [viewerId, ...users.map(item => item.id)]);
        await tx.execute(`DELETE FROM student_profile_details WHERE user_id IN (${users.map(() => '?').join(',') || "''"})`,
          users.map(item => item.id));
        await tx.execute(`DELETE FROM student_profiles WHERE user_id IN (${[viewerId, ...users.map(item => item.id)].map(() => '?').join(',')})`,
          [viewerId, ...users.map(item => item.id)]);
        await tx.execute(`DELETE FROM users WHERE id IN (${[adminId, viewerId, ...users.map(item => item.id)].map(() => '?').join(',')})`,
          [adminId, viewerId, ...users.map(item => item.id)]);
        if (insertedLevelCodes.length) await tx.execute(`DELETE FROM skill_level_catalog WHERE code IN
          (${insertedLevelCodes.map(() => '?').join(',')})`, insertedLevelCodes);
        if (insertedSkillIds.length) await tx.execute(`DELETE FROM skill_catalog WHERE id IN
          (${insertedSkillIds.map(() => '?').join(',')})`, insertedSkillIds);
        if (insertedCareerIds.length) {
          await tx.execute(`DELETE FROM career_cycles WHERE career_id IN
            (${insertedCareerIds.map(() => '?').join(',')})`, insertedCareerIds);
          await tx.execute(`DELETE FROM careers WHERE id IN (${insertedCareerIds.map(() => '?').join(',')})`,
            insertedCareerIds);
        }
      });
    } finally { await database.close(); await rm(storageRoot, { recursive: true, force: true }); }
  }
});
