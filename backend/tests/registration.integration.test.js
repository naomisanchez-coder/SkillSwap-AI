import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createDatabase } from '../src/config/db.js';
import { createAuthRepository } from '../src/modules/auth/auth.repository.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/modules/auth/password.service.js';

const requested = Object.keys(process.env).some((key) => key.startsWith('DATABASE_TEST_'));
test('isolated registration: real repository + HTTP, consent, hashes, concurrent duplicates, rollback and health', {
  skip: requested ? false : 'Isolated DML credentials not configured', timeout: 60000,
}, async () => {
  let db;
  let catalogueCreated = false;
  const careerId = randomUUID();
  const careerName = `Registration test ${careerId}`;
  const emails = Array.from({ length: 5 }, () => `test.${[...randomBytes(18)].map((n) => String.fromCharCode(97 + n % 26)).join('')}@tecsup.edu.pe`);
  try {
    assert.equal(process.env.DATABASE_TEST_DB, 'skillswap_ai_test_auth');
    assert.equal(process.env.DATABASE_TEST_USER, 'skillswap_test_app');
    assert.ok(process.env.DATABASE_TEST_PASSWORD);
    db = createDatabase({ host: '127.0.0.1', port: 3306, database: 'skillswap_ai_test_auth',
      user: process.env.DATABASE_TEST_USER, password: process.env.DATABASE_TEST_PASSWORD });
    const [[identity]] = await db.execute('SELECT CURRENT_USER() AS account, DATABASE() AS db');
    assert.equal(identity.account, 'skillswap_test_app@127.0.0.1');
    assert.equal(identity.db, 'skillswap_ai_test_auth');
    await db.transaction(async (tx) => {
      await tx.execute('INSERT INTO careers (id, code, name) VALUES (?, ?, ?)', [careerId, `REG_${careerId}`, careerName]);
      await tx.execute('INSERT INTO career_cycles (career_id, cycle) VALUES (?, ?)', [careerId, 3]);
    });
    catalogueCreated = true;
    const password = randomBytes(20).toString('hex');
    const passwordHash = await hashPassword(password);
    const input = (email) => ({ firstName: 'Prueba', lastName: 'Aislada', email,
      career: careerName, cycle: 3, passwordHash,
      termsAcceptedAt: new Date(), termsVersion: 'isolated-fixture', privacyVersion: 'isolated-fixture' });
    const repo = createAuthRepository(db);
    const created = await repo.createStudent(input(emails[0]));
    const [[user]] = await db.execute('SELECT role, status, email_verified_at AS verified, password_hash AS hash FROM users WHERE id = ?', [created.id]);
    assert.equal(user.role, 'STUDENT');
    assert.equal(user.status, 'PENDING_VERIFICATION');
    assert.equal(user.verified, null);
    assert.equal(user.hash, passwordHash);
    assert.notEqual(user.hash, password);
    const [[profile]] = await db.execute('SELECT cycle, onboarding_complete AS complete FROM student_profiles WHERE user_id = ?', [created.id]);
    assert.equal(profile.cycle, 3);
    assert.equal(profile.complete, 0);
    await assert.rejects(repo.createStudent(input(emails[0])), (e) => e.code === 'EMAIL_ALREADY_REGISTERED');
    const concurrent = await Promise.allSettled([repo.createStudent(input(emails[1])), repo.createStudent(input(emails[1]))]);
    assert.equal(concurrent.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(concurrent.find((r) => r.status === 'rejected').reason.code, 'EMAIL_ALREADY_REGISTERED');
    const [[count]] = await db.execute('SELECT COUNT(*) AS total FROM users WHERE email = ?', [emails[1]]);
    assert.equal(count.total, 1);
    await assert.rejects(repo.createStudent({ ...input(emails[2]), career: `missing-${randomUUID()}` }), (e) => e.code === 'VALIDATION_ERROR');
    await assert.rejects(repo.createStudent({ ...input(emails[2]), cycle: 4 }), (e) => e.code === 'VALIDATION_ERROR');
    await db.execute('UPDATE careers SET is_active = FALSE WHERE id = ?', [careerId]);
    await assert.rejects(repo.createStudent(input(emails[2])), (e) => e.code === 'VALIDATION_ERROR');
    await db.execute('UPDATE careers SET is_active = TRUE WHERE id = ?', [careerId]);
    // Force an actual MySQL FK failure only in the profile parameters; user INSERT and rollback are real.
    const failing = createAuthRepository({ transaction(work) {
      return db.transaction((tx) => work({ execute(sql, values) {
        if (sql.startsWith('INSERT INTO student_profiles')) return tx.execute(sql, [values[0], randomUUID(), values[2]]);
        return tx.execute(sql, values);
      } }));
    }, execute: db.execute });
    await assert.rejects(failing.createStudent(input(emails[3])), (e) => e.code === 'ER_NO_REFERENCED_ROW_2');
    const [[absent]] = await db.execute('SELECT COUNT(*) AS total FROM users WHERE email = ?', [emails[3]]);
    assert.equal(absent.total, 0);
    const server = createApp({ database: db, origins: ['http://localhost:5173'] }).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const post = (email) => fetch(`${base}/api/auth/register`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
        body: JSON.stringify({ firstName: 'Prueba', lastName: 'Aislada', email,
          career: careerName, cycle: 3, password, termsAccepted: true,
          termsVersion: '1.0.0', privacyVersion: '1.0.0' }) });
      assert.equal((await fetch(`${base}/api/health`)).status, 200);
      assert.equal((await fetch(`${base}/api/health/db`)).status, 200);
      const response = await post(` ${emails[2].toUpperCase()} `);
      assert.equal(response.status, 201);
      assert.equal(response.headers.get('set-cookie'), null);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
      assert.deepEqual(await response.json(), { user: { email: emails[2], role: 'student',
        emailVerified: false, onboardingComplete: false } });
      const [[consent]] = await db.execute('SELECT terms_version, privacy_version, terms_accepted_at FROM users WHERE email = ?', [emails[2]]);
      assert.equal(consent.terms_version, '1.0.0');
      assert.equal(consent.privacy_version, '1.0.0');
      assert.ok(consent.terms_accepted_at instanceof Date);
      const duplicate = await post(emails[2]);
      assert.equal(duplicate.status, 409);
      assert.equal((await duplicate.json()).error.code, 'EMAIL_ALREADY_REGISTERED');
      const raced = await Promise.all([post(emails[4]), post(emails[4])]);
      assert.deepEqual(raced.map((r) => r.status).sort(), [201, 409]);
      const [[single]] = await db.execute('SELECT COUNT(*) AS total FROM users WHERE email = ?', [emails[4]]);
      assert.equal(single.total, 1);
      const [[stored]] = await db.execute('SELECT password_hash AS hash FROM users WHERE email = ?', [emails[2]]);
      assert.ok(stored.hash.startsWith('$scrypt$N=131072,r=8,p=1$'));
      assert.notEqual(stored.hash, passwordHash); // Each HTTP registration has a new salt.
    } finally { await new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve())); }
    for (const table of ['auth_sessions', 'credit_transactions', 'email_verifications']) {
      const [[empty]] = await db.execute(`SELECT COUNT(*) AS total FROM ${table} WHERE user_id IN (SELECT id FROM users WHERE email IN (?, ?, ?, ?, ?))`, emails);
      assert.equal(empty.total, 0);
    }
  } catch (error) {
    const code = /^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'REPOSITORY_CHECK_FAILED';
    throw new Error(`Isolated registration repository verification failed (${code}); no SQL or bindings exposed`);
  } finally {
    if (db) {
      try {
        if (catalogueCreated) {
          // Delete only rows owned by this fixture; no principal access or global cleanup.
          await db.transaction(async (tx) => {
            await tx.execute('DELETE FROM student_profiles WHERE user_id IN (SELECT id FROM users WHERE email IN (?, ?, ?, ?, ?))', emails);
            await tx.execute('DELETE FROM users WHERE email IN (?, ?, ?, ?, ?)', emails);
            await tx.execute('DELETE FROM career_cycles WHERE career_id = ?', [careerId]);
            await tx.execute('DELETE FROM careers WHERE id = ?', [careerId]);
          });
        }
      } catch {
        throw new Error('Isolated fixture cleanup failed; preserve schema and inspect test-owned identifiers locally');
      } finally { await db.close(); }
    }
  }
});
