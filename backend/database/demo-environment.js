import { randomBytes, randomUUID } from 'node:crypto';
import { readDemoMentors } from './demo-mentors.js';
import { readAcademicCatalog } from './academic-catalog.js';
import { readSkillCatalog } from './skill-catalog.js';
import { createAuthRepository } from '../src/modules/auth/auth.repository.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createEmailRepository } from '../src/modules/auth/email.repository.js';
import { createEmailService } from '../src/modules/auth/email.service.js';
import { createEmailRateRepository } from '../src/modules/auth/email-rate.repository.js';
import { createEmailVerificationRepository } from '../src/modules/auth/email-verification.repository.js';
import { createEmailVerificationService } from '../src/modules/auth/email-verification.service.js';
import { createCodeProtection, createRateIdentifier } from '../src/modules/auth/email-code.js';
import { otpPolicy } from '../src/modules/auth/email.policy.js';
import { dummyPasswordHash } from '../src/modules/auth/password.service.js';
import { createStudentRepository } from '../src/modules/student/student.repository.js';
import { createStudentService } from '../src/modules/student/student.service.js';
import { createMentorRepository } from '../src/modules/student/mentor.repository.js';
import { createMentorService } from '../src/modules/student/mentor.service.js';
import { createBookingRepository } from '../src/modules/student/booking.repository.js';
import { createBookingService } from '../src/modules/student/booking.service.js';
import { createAdminRepository } from '../src/modules/admin/admin.repository.js';
import { createAdminService } from '../src/modules/admin/admin.service.js';
import { createPrivateFileReader } from '../src/modules/student/private-file-reader.js';

const adminEmail = 'skillswap.demo.admin@example.test';
const emailByKey = Object.freeze({
  'diego-ramirez-torres': 'demo.diego@tecsup.edu.pe',
  'valeria-mendoza-flores': 'demo.valeria@tecsup.edu.pe',
  'andres-castillo-vega': 'demo.andres@tecsup.edu.pe',
});
const certificate = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Subject (EVIDENCIA ACADEMICA FICTICIA - SOLO DEMOSTRACION) >>\nendobj\n%%EOF');
const avatar = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

function expectedEmails(manifest) {
  return manifest.mentors.map(mentor => emailByKey[mentor.key]);
}

export async function inspectDemoEnvironment(database) {
  const manifest = await readDemoMentors();
  const emails = expectedEmails(manifest);
  const [rows] = await database.execute(`SELECT u.id,u.first_name,u.last_name,u.email,u.role,u.status,
    u.email_verified_at,c.code career_code,p.cycle,s.code skill_code,ma.status application_status,
    mo.status offer_status,msl.level_code,
    EXISTS(SELECT 1 FROM student_profile_photos spp WHERE spp.user_id=u.id) has_photo,
    (SELECT GROUP_CONCAT(CONCAT(av.weekday,'|',TIME_FORMAT(av.start_time,'%H:%i'),'|',
      TIME_FORMAT(av.end_time,'%H:%i')) ORDER BY av.weekday,av.start_time,av.end_time SEPARATOR ',')
      FROM mentor_availability av WHERE av.mentor_user_id=u.id AND av.is_active=TRUE) schedule
    FROM users u JOIN student_profiles p ON p.user_id=u.id JOIN careers c ON c.id=p.career_id
    LEFT JOIN mentor_applications ma ON ma.user_id=u.id LEFT JOIN skill_catalog s ON s.id=ma.skill_id
    LEFT JOIN mentor_offers mo ON mo.mentor_user_id=u.id AND mo.skill_id=ma.skill_id
    LEFT JOIN mentor_skill_levels msl ON msl.offer_id=mo.id
    WHERE u.email IN (?,?,?) ORDER BY u.email`, emails);
  const [admins] = await database.execute(`SELECT id,role,status,email_verified_at FROM users WHERE email=?`, [adminEmail]);
  const complete = rows.length === 3 && admins.length === 1 && admins[0].role === 'ADMIN' &&
    admins[0].status === 'ACTIVE' && admins[0].email_verified_at && rows.every(row => {
      const item = manifest.mentors.find(mentor => emailByKey[mentor.key] === row.email);
      const schedule = item?.availability.map(slot => `${slot.weekday}|${slot.start}|${slot.end}`).join(',');
      return item && row.first_name === item.firstName && row.last_name === item.lastName &&
        row.career_code === item.careerCode && Number(row.cycle) === item.cycle &&
        row.skill_code === item.skillCode && row.role === 'STUDENT' && row.status === 'ACTIVE' &&
        row.email_verified_at && row.application_status === 'APPROVED' && row.offer_status === 'ACTIVE' &&
        row.level_code === item.levelCode && Number(row.has_photo) === 1 && row.schedule === schedule;
    });
  return { manifest, emails, rows, admins, complete };
}

async function removeCreated(database, storage, userIds, adminId, rateIdentifiers) {
  if (!userIds.length && !adminId) return;
  const all = [...userIds, ...(adminId ? [adminId] : [])];
  const placeholders = userIds.map(() => '?').join(',') || "''";
  let storageKeys = [];
  try {
    const [files] = await database.execute(`SELECT storage_key FROM private_files WHERE owner_user_id IN (${placeholders})`, userIds);
    storageKeys = files.map(row => row.storage_key);
    await database.transaction(async tx => {
      await tx.execute(`DELETE msl FROM mentor_skill_levels msl JOIN mentor_offers mo ON mo.id=msl.offer_id
        WHERE mo.mentor_user_id IN (${placeholders})`, userIds);
      await tx.execute(`DELETE FROM mentor_availability WHERE mentor_user_id IN (${placeholders})`, userIds);
      await tx.execute(`DELETE FROM mentor_offers WHERE mentor_user_id IN (${placeholders})`, userIds);
      await tx.execute(`DELETE e FROM mentor_application_events e JOIN mentor_applications a ON a.id=e.application_id
        WHERE a.user_id IN (${placeholders})`, userIds);
      await tx.execute(`DELETE d FROM mentor_application_documents d JOIN mentor_applications a ON a.id=d.application_id
        WHERE a.user_id IN (${placeholders})`, userIds);
      await tx.execute(`DELETE FROM mentor_applications WHERE user_id IN (${placeholders})`, userIds);
      await tx.execute(`DELETE FROM student_profile_photos WHERE user_id IN (${placeholders})`, userIds);
      await tx.execute(`DELETE FROM private_files WHERE owner_user_id IN (${placeholders})`, userIds);
      await tx.execute(`DELETE FROM student_skills WHERE user_id IN (${placeholders})`, userIds);
      await tx.execute(`DELETE FROM student_interests WHERE user_id IN (${placeholders})`, userIds);
      await tx.execute(`DELETE FROM student_profile_details WHERE user_id IN (${placeholders})`, userIds);
      await tx.execute(`DELETE FROM credit_transactions WHERE user_id IN (${placeholders})`, userIds);
      await tx.execute(`DELETE FROM email_verifications WHERE user_id IN (${placeholders})`, userIds);
      await tx.execute(`DELETE FROM student_profiles WHERE user_id IN (${placeholders})`, userIds);
      if (rateIdentifiers.length) await tx.execute(`DELETE FROM otp_request_limits WHERE email_hmac IN
        (${rateIdentifiers.map(() => '?').join(',')})`, rateIdentifiers);
      await tx.execute(`DELETE FROM users WHERE id IN (${all.map(() => '?').join(',')})`, all);
    });
  } finally {
    await Promise.allSettled(storageKeys.map(key => storage.remove(key)));
  }
}

export async function provisionDemoMentors(database, storage) {
  const state = await inspectDemoEnvironment(database);
  if (state.complete) return { created: false, mentors: state.rows.length };
  if (state.rows.length || state.admins.length) throw new Error('Partial or conflicting demo mentor state');

  const academic = await readAcademicCatalog();
  const skills = await readSkillCatalog(new URL('./catalogs/demo-skills-1.0.0.json', import.meta.url));
  const createdUsers = [];
  const rateIdentifiers = [];
  let adminId;
  const challengeKey = randomBytes(32).toString('hex');
  const rateKey = randomBytes(32).toString('hex');
  const protection = createCodeProtection({ keyHex: challengeKey, keyVersion: 'demo-ephemeral-v1' });
  const identifyRate = createRateIdentifier(rateKey);
  const delivered = new Map();
  const emailService = createEmailService({ repository: createEmailRepository(database),
    rateRepository: createEmailRateRepository(database), rateIdentifier(email) {
      const value = identifyRate(email); rateIdentifiers.push(value); return value;
    }, protection, policy: otpPolicy, mailer: Object.freeze({
      async sendVerification(message) { delivered.set(message.to, message.code); }, close() {},
    }) });
  const verification = createEmailVerificationService(createEmailVerificationRepository(database), protection);
  const auth = createAuthService(createAuthRepository(database));
  const student = createStudentService(createStudentRepository(database));
  const mentor = createMentorService(createMentorRepository(database), storage);
  const booking = createBookingService(createBookingRepository(database));
  const admin = createAdminService(createAdminRepository(database), createPrivateFileReader(storage));
  try {
    adminId = randomUUID();
    await database.execute(`INSERT INTO users (id,first_name,last_name,email,password_hash,role,status,email_verified_at)
      VALUES (?,?,?,?,?,'ADMIN','ACTIVE',UTC_TIMESTAMP(6))`,
    [adminId, 'Administración', 'Demostración', adminEmail, dummyPasswordHash]);
    for (const item of state.manifest.mentors) {
      const career = academic.careers.find(value => value.code === item.careerCode);
      const skill = skills.skills.find(value => value.code === item.skillCode);
      const email = emailByKey[item.key];
      await auth.register({ firstName: item.firstName, lastName: item.lastName, email,
        career: career.name, cycle: item.cycle, password: randomBytes(24).toString('base64url'),
        termsAccepted: true, termsVersion: '1.0.0', privacyVersion: '1.0.0' });
      const [[created]] = await database.execute('SELECT id FROM users WHERE email=?', [email]);
      createdUsers.push(created.id);
      const request = await emailService.request({ email });
      await emailService.idle();
      const code = delivered.get(email);
      if (!code) throw new Error('Substituted OTP delivery failed');
      await verification.verify({ email, verificationId: request.verificationId, code });
      delivered.delete(email);
      await student.updateProfile(created.id, { bio: item.bio });
      await mentor.savePhoto(created.id, { fields: {}, files: { photo: {
        buffer: avatar, mediaType: 'image/png',
      } } });
      const application = await mentor.createApplication(created.id, { fields: { skillId: skill.id }, files: {
        certificate: { buffer: certificate, mediaType: 'application/pdf' },
      } });
      await admin.document(application.id, 'certificate');
      await admin.decide(adminId, application.id, { decision: 'APPROVED',
        reason: 'Evidencia académica ficticia revisada para la demostración local.' });
      const offer = await booking.setOffer(created.id, skill.id, { active: true });
      await booking.replaceAvailability(created.id, { slots: item.availability });
      await admin.assignLevel(adminId, offer.id, { levelCode: item.levelCode });
    }
    await emailService.close();
    if (rateIdentifiers.length) await database.execute(`DELETE FROM otp_request_limits WHERE email_hmac IN
      (${rateIdentifiers.map(() => '?').join(',')})`, rateIdentifiers);
    const completed = await inspectDemoEnvironment(database);
    if (!completed.complete) throw new Error('Demo mentor verification failed');
    return { created: true, mentors: completed.rows.length };
  } catch (error) {
    await emailService.close();
    await removeCreated(database, storage, createdUsers, adminId, rateIdentifiers);
    throw error;
  }
}
