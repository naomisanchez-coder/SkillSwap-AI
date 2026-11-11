import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDatabase } from '../src/config/db.js';
import { createStudentRepository } from '../src/modules/student/student.repository.js';
import { createStudentService } from '../src/modules/student/student.service.js';
import { hashPassword } from '../src/modules/auth/password.service.js';

const requested = Object.keys(process.env).some(key => key.startsWith('DATABASE_TEST_'));
test('real isolated student profile persists ownership, catalog and derived onboarding atomically', {
  skip: requested ? false : '005 isolated integration pending', timeout: 60000,
}, async () => {
  assert.equal(process.env.DATABASE_TEST_DB, 'skillswap_ai_test_auth');
  assert.equal(process.env.DATABASE_TEST_USER, 'skillswap_test_app');
  const db = createDatabase({ host: '127.0.0.1', port: 3306, database: process.env.DATABASE_TEST_DB,
    user: process.env.DATABASE_TEST_USER, password: process.env.DATABASE_TEST_PASSWORD });
  const userId = randomUUID(), careerId = randomUUID();
  try {
    const [[identity]] = await db.execute('SELECT CURRENT_USER() account,DATABASE() db');
    assert.equal(identity.account, 'skillswap_test_app@127.0.0.1'); assert.equal(identity.db, 'skillswap_ai_test_auth');
    const hash = await hashPassword(randomBytes(24).toString('hex'));
    await db.transaction(async tx => {
      await tx.execute('INSERT INTO careers (id,code,name) VALUES (?,?,?)', [careerId, `PROFILE_${careerId}`, 'Perfil aislado']);
      await tx.execute('INSERT INTO career_cycles (career_id,cycle) VALUES (?,?)', [careerId, 3]);
      await tx.execute(`INSERT INTO users (id,first_name,last_name,email,password_hash,role,status,email_verified_at,
        terms_accepted_at,terms_version,privacy_version) VALUES (?,?,?,?,?,'STUDENT','ACTIVE',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),'test','test')`,
      [userId, 'Perfil', 'Aislado', `perfil.${randomBytes(8).toString('hex')}@tecsup.edu.pe`, hash]);
      await tx.execute('INSERT INTO student_profiles (user_id,career_id,cycle,onboarding_complete) VALUES (?,?,?,FALSE)', [userId, careerId, 3]);
    });
    const service = createStudentService(createStudentRepository(db));
    const initial = await service.profile(userId); assert.equal(initial.onboardingComplete, false); assert.deepEqual(initial.interests, []);
    const done = await service.completeOnboarding(userId, { interests: ['Python', 'Excel'], level: 'Intermedio', schedule: 'Tardes' });
    assert.equal(done.complete, true);
    const updated = await service.updateProfile(userId, { bio: 'Perfil aislado', goals: 'Aprender con la comunidad' });
    assert.equal(updated.bio, 'Perfil aislado'); assert.equal(updated.goals, 'Aprender con la comunidad');
    const catalog = await service.catalog(); assert.ok(catalog.careers.some(item => item.name === 'Perfil aislado' && item.cycles.includes(3)));
    const [[count]]=await db.execute('SELECT COUNT(*) total FROM student_interests WHERE user_id=?',[userId]);assert.equal(Number(count.total),2);
  } finally {
    try { await db.transaction(async tx => {
      await tx.execute('DELETE FROM student_interests WHERE user_id=?', [userId]);
      await tx.execute('DELETE FROM student_profile_details WHERE user_id=?', [userId]);
      await tx.execute('DELETE FROM student_profiles WHERE user_id=?', [userId]);
      await tx.execute('DELETE FROM users WHERE id=?', [userId]);
      await tx.execute('DELETE FROM career_cycles WHERE career_id=?', [careerId]);
      await tx.execute('DELETE FROM careers WHERE id=?', [careerId]);
    }); } finally { await db.close(); }
  }
});
