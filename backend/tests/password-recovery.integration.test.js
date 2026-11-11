import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createDatabase } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { hashPassword, verifyPassword } from '../src/modules/auth/password.service.js';
import { createPasswordRecoveryProtection, createPasswordRecoveryRateIdentifiers } from '../src/modules/auth/password-recovery.js';
import { createPasswordRecoveryRateRepository } from '../src/modules/auth/password-recovery-rate.repository.js';
import { createPasswordRecoveryRepository } from '../src/modules/auth/password-recovery.repository.js';
import { createPasswordRecoveryService } from '../src/modules/auth/password-recovery.service.js';
import { passwordRecoveryPolicy } from '../src/modules/auth/password-recovery.policy.js';

const requested = Object.keys(process.env).some(key => key.startsWith('DATABASE_TEST_'));

test('real isolated recovery is uniform, protected, atomic, concurrent and revokes sessions', {
  skip: requested ? false : 'isolated MySQL password recovery integration pending', timeout: 60000,
}, async () => {
  assert.equal(process.env.DATABASE_TEST_DB, 'skillswap_ai_test_auth');
  assert.equal(process.env.DATABASE_TEST_USER, 'skillswap_test_app');
  let database;
  let server;
  const userId = randomUUID();
  const adminId = randomUUID();
  const origin = 'http://localhost:5173';
  const ip = '127.0.0.1';
  const letters = () => [...randomBytes(10)].map(value => String.fromCharCode(97 + value % 26)).join('');
  const email = `${letters()}.${letters()}@tecsup.edu.pe`;
  const missingEmail = `${letters()}.${letters()}@tecsup.edu.pe`;
  const adminEmail = `${letters()}@example.invalid`;
  const oldPassword = `Anterior-${randomBytes(12).toString('hex')}`;
  const newPassword = `Nueva-${randomBytes(12).toString('hex')}`;
  const challengeKey = randomBytes(32).toString('hex');
  const rateKey = randomBytes(32).toString('hex');
  const protection = createPasswordRecoveryProtection({ keyHex: challengeKey, keyVersion: 'integration-v1' });
  const identifiers = createPasswordRecoveryRateIdentifiers(rateKey);
  const delivered = [];
  const notifications = [];
  const creditId = randomUUID();
  const careerId = randomUUID();
  const creditReference = `recovery-fixture:${randomUUID()}`;
  const sessionHash = randomBytes(32);
  const csrfHmac = randomBytes(32);
  try {
    database = createDatabase({ host: '127.0.0.1', port: 3306, database: process.env.DATABASE_TEST_DB,
      user: process.env.DATABASE_TEST_USER, password: process.env.DATABASE_TEST_PASSWORD });
    const [[identity]] = await database.execute('SELECT CURRENT_USER() AS account,DATABASE() AS db');
    assert.equal(identity.account, 'skillswap_test_app@127.0.0.1');
    assert.equal(identity.db, 'skillswap_ai_test_auth');
    const [schema] = await database.execute('SELECT version FROM schema_migrations WHERE version=?',
      ['004_password_recovery']);
    assert.equal(schema.length, 1);
    const catalog = { career_id: careerId, cycle: 2 };
    const oldHash = await hashPassword(oldPassword);
    const newHash = await hashPassword(newPassword);
    const now = new Date();
    await database.transaction(async tx => {
      await tx.execute('INSERT INTO careers (id,code,name) VALUES (?,?,?)',
        [careerId, `RECOVERY_${careerId}`, 'Recuperación aislada']);
      await tx.execute('INSERT INTO career_cycles (career_id,cycle) VALUES (?,?)', [careerId, catalog.cycle]);
      await tx.execute(`INSERT INTO users (id,first_name,last_name,email,password_hash,role,status,email_verified_at,
        terms_accepted_at,terms_version,privacy_version,created_at) VALUES (?,?,?,?,?,'STUDENT','ACTIVE',?,?,?,?,?)`,
      [userId, 'Prueba', 'Recuperación', email, oldHash, now, now, 'test', 'test', now]);
      await tx.execute(`INSERT INTO users (id,first_name,last_name,email,password_hash,role,status,email_verified_at,
        created_at) VALUES (?,?,?,?,?,'ADMIN','ACTIVE',?,?)`,
      [adminId, 'Admin', 'Recuperación', adminEmail, oldHash, now, now]);
      await tx.execute('INSERT INTO student_profiles (user_id,career_id,cycle,onboarding_complete) VALUES (?,?,?,?)',
        [userId, catalog.career_id, catalog.cycle, false]);
      await tx.execute(`INSERT INTO credit_transactions (id,user_id,amount,reason,operation_reference)
        VALUES (?,?,5,'RECOVERY_TEST',?)`, [creditId, userId, creditReference]);
      await tx.execute(`INSERT INTO auth_sessions
        (id_hash,user_id,csrf_token_hmac,created_at,last_seen_at,idle_expires_at,absolute_expires_at,remember)
        VALUES (?,?,?,?,?,?,?,FALSE)`, [sessionHash, userId, csrfHmac, now, now,
        new Date(now.getTime() + 1800000), new Date(now.getTime() + 28800000)]);
    });
    const repository = createPasswordRecoveryRepository(database);
    const rateRepository = createPasswordRecoveryRateRepository(database);
    const mailer = {
      async sendPasswordRecovery(message) { delivered.push(message); },
      async sendPasswordChanged(message) { notifications.push(message); },
    };
    const service = createPasswordRecoveryService({ repository, rateRepository, identifiers, protection, mailer,
      policy: passwordRecoveryPolicy, hash: async password => {
        assert.equal(password, newPassword);
        return newHash;
      } });
    server = createApp({ database, origins: [origin], recoveryService: service }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { 'Content-Type': 'application/json', 'X-CSRF-Protection': '1', Origin: origin };
    const requestRecovery = address => fetch(`${base}/api/auth/password-recovery/request`, { method: 'POST', headers,
      body: JSON.stringify({ email: address }) });
    const raced = await Promise.all([requestRecovery(email), requestRecovery(email)]);
    assert.deepEqual(raced.map(response => response.status).sort(), [202, 429]);
    const accepted = raced.find(response => response.status === 202);
    const firstBody = await accepted.json();
    await service.idle();
    assert.equal(delivered.length, 1);
    let [[challenge]] = await database.execute(`SELECT status,code_hmac,attempts FROM password_recovery_challenges
      WHERE id=?`, [firstBody.recoveryId]);
    assert.equal(challenge.status, 'PENDING');
    assert.equal(challenge.code_hmac.length, 32);
    assert.equal(challenge.code_hmac.includes(Buffer.from(delivered[0].code)), false);

    const emailHmac = identifiers.email(email);
    await database.execute(`UPDATE password_recovery_limits
      SET window_started_at=DATE_SUB(window_started_at,INTERVAL 61 SECOND),
          expires_at=DATE_SUB(expires_at,INTERVAL 61 SECOND),
          last_admitted_at=DATE_SUB(last_admitted_at,INTERVAL 61 SECOND)
      WHERE scope='EMAIL' AND identifier_hmac=?`, [emailHmac]);
    const resent = await requestRecovery(email);
    assert.equal(resent.status, 202);
    const secondBody = await resent.json();
    await service.idle();
    const [[firstState]] = await database.execute('SELECT status FROM password_recovery_challenges WHERE id=?',
      [firstBody.recoveryId]);
    assert.equal(firstState.status, 'REVOKED');
    const [[secondState]] = await database.execute('SELECT status FROM password_recovery_challenges WHERE id=?',
      [secondBody.recoveryId]);
    assert.equal(secondState.status, 'PENDING');

    const missing = await requestRecovery(missingEmail);
    assert.equal(missing.status, 202);
    const missingBody = await missing.json();
    await service.idle();
    assert.deepEqual({ status: missingBody.status, message: missingBody.message },
      { status: secondBody.status, message: secondBody.message });
    const [[missingChallenge]] = await database.execute('SELECT COUNT(*) total FROM password_recovery_challenges WHERE id=?',
      [missingBody.recoveryId]);
    assert.equal(Number(missingChallenge.total), 0);

    const reset = (code, recoveryId = secondBody.recoveryId) => fetch(`${base}/api/auth/password-recovery/reset`, {
      method: 'POST', headers, body: JSON.stringify({ email, recoveryId, code, newPassword }) });
    const wrongCode = delivered[1].code === '000000' ? '999999' : '000000';
    assert.equal((await reset(wrongCode)).status, 422);
    [[challenge]] = await database.execute('SELECT status,attempts FROM password_recovery_challenges WHERE id=?',
      [secondBody.recoveryId]);
    assert.equal(challenge.status, 'PENDING');
    assert.equal(Number(challenge.attempts), 1);
    const concurrent = await Promise.all([reset(delivered[1].code), reset(delivered[1].code)]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 422]);
    [[challenge]] = await database.execute('SELECT status,consumed_at FROM password_recovery_challenges WHERE id=?',
      [secondBody.recoveryId]);
    assert.equal(challenge.status, 'CONSUMED');
    assert.ok(challenge.consumed_at);
    const [[account]] = await database.execute('SELECT password_hash,role FROM users WHERE id=?', [userId]);
    assert.equal(account.role, 'STUDENT');
    assert.equal(await verifyPassword(oldPassword, account.password_hash), false);
    assert.equal(await verifyPassword(newPassword, account.password_hash), true);
    const [[session]] = await database.execute('SELECT revoked_at FROM auth_sessions WHERE id_hash=?', [sessionHash]);
    assert.ok(session.revoked_at);
    const [[sessionCount]] = await database.execute('SELECT COUNT(*) total FROM auth_sessions WHERE user_id=?', [userId]);
    assert.equal(Number(sessionCount.total), 1);
    const [[credit]] = await database.execute('SELECT amount,reason FROM credit_transactions WHERE id=?', [creditId]);
    assert.deepEqual({ amount: Number(credit.amount), reason: credit.reason }, { amount: 5, reason: 'RECOVERY_TEST' });
    const [[profile]] = await database.execute('SELECT career_id,cycle FROM student_profiles WHERE user_id=?', [userId]);
    assert.equal(profile.career_id, catalog.career_id);
    assert.equal(Number(profile.cycle), Number(catalog.cycle));
    assert.deepEqual(notifications, [{ to: email }]);

    const adminRequest = await requestRecovery(adminEmail);
    assert.equal(adminRequest.status, 202);
    const adminBody = await adminRequest.json();
    await service.idle();
    const adminDelivery = delivered.at(-1);
    assert.equal(adminDelivery.to, adminEmail);
    const adminReset = await fetch(`${base}/api/auth/password-recovery/reset`, { method: 'POST', headers,
      body: JSON.stringify({ email: adminEmail, recoveryId: adminBody.recoveryId,
        code: adminDelivery.code, newPassword }) });
    assert.equal(adminReset.status, 200);
    const [[adminAccount]] = await database.execute('SELECT password_hash,role FROM users WHERE id=?', [adminId]);
    assert.equal(adminAccount.role, 'ADMIN');
    assert.equal(await verifyPassword(newPassword, adminAccount.password_hash), true);
    const [[adminProfile]] = await database.execute('SELECT COUNT(*) total FROM student_profiles WHERE user_id=?',
      [adminId]);
    assert.equal(Number(adminProfile.total), 0);

    const makeChallenge = async ({ expired = false } = {}) => {
      const id = randomUUID();
      const code = String(randomInt(0, 1000000)).padStart(6, '0');
      const createdAt = expired ? new Date(Date.now() - 1200000) : new Date(Date.now() - 1000);
      const expiresAt = expired ? new Date(Date.now() - 600000) : new Date(Date.now() + 600000);
      await database.execute(`INSERT INTO password_recovery_challenges
        (id,user_id,code_hmac,hmac_key_version,status,attempts,max_attempts,expires_at,created_at)
        VALUES (?,?,?,?,'PENDING',0,5,?,?)`,
      [id, userId, protection.digest({ id, email, code }), protection.keyVersion, expiresAt, createdAt]);
      return { id, code };
    };
    const exhausted = await makeChallenge();
    const mismatch = protection.digest({ id: exhausted.id, email, code: exhausted.code === '111111' ? '222222' : '111111' });
    for (let attempt = 0; attempt < 5; attempt++) {
      assert.equal((await repository.reset({ id: exhausted.id, email, digest: mismatch,
        passwordHash: newHash, maxAttempts: 5 })).changed, false);
    }
    const [[exhaustedRow]] = await database.execute(
      'SELECT status,attempts FROM password_recovery_challenges WHERE id=?', [exhausted.id]);
    assert.deepEqual({ status: exhaustedRow.status, attempts: Number(exhaustedRow.attempts) },
      { status: 'EXHAUSTED', attempts: 5 });
    const expired = await makeChallenge({ expired: true });
    assert.equal((await repository.reset({ id: expired.id, email,
      digest: protection.digest({ id: expired.id, email, code: expired.code }),
      passwordHash: newHash, maxAttempts: 5 })).changed, false);
    const [[expiredRow]] = await database.execute('SELECT status FROM password_recovery_challenges WHERE id=?',
      [expired.id]);
    assert.equal(expiredRow.status, 'EXPIRED');

    const rollback = await makeChallenge();
    const faultyDatabase = { transaction: work => database.transaction(tx => work({
      execute(sql, values) {
        if (sql.startsWith('UPDATE users SET password_hash')) throw new Error('Injected update failure');
        return tx.execute(sql, values);
      },
    })) };
    const faulty = createPasswordRecoveryRepository(faultyDatabase);
    await assert.rejects(faulty.reset({ id: rollback.id, email,
      digest: protection.digest({ id: rollback.id, email, code: rollback.code }),
      passwordHash: oldHash, maxAttempts: 5 }));
    const [[rolledBack]] = await database.execute('SELECT status,consumed_at FROM password_recovery_challenges WHERE id=?',
      [rollback.id]);
    assert.equal(rolledBack.status, 'PENDING');
    assert.equal(rolledBack.consumed_at, null);
    const [[unchanged]] = await database.execute('SELECT password_hash FROM users WHERE id=?', [userId]);
    assert.equal(unchanged.password_hash, newHash);
    await service.close();
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (database) {
      try {
        await database.transaction(async tx => {
          await tx.execute('DELETE FROM password_recovery_challenges WHERE user_id IN (?,?)', [userId, adminId]);
          await tx.execute('DELETE FROM password_recovery_limits WHERE scope=? AND identifier_hmac=?',
            ['EMAIL', identifiers.email(email)]);
          await tx.execute('DELETE FROM password_recovery_limits WHERE scope=? AND identifier_hmac=?',
            ['EMAIL', identifiers.email(missingEmail)]);
          await tx.execute('DELETE FROM password_recovery_limits WHERE scope=? AND identifier_hmac=?',
            ['EMAIL', identifiers.email(adminEmail)]);
          await tx.execute('DELETE FROM password_recovery_limits WHERE scope=? AND identifier_hmac=?',
            ['IP', identifiers.ip(ip)]);
          await tx.execute('DELETE FROM auth_sessions WHERE user_id=?', [userId]);
          await tx.execute('DELETE FROM credit_transactions WHERE user_id=?', [userId]);
          await tx.execute('DELETE FROM student_profiles WHERE user_id=?', [userId]);
          await tx.execute('DELETE FROM users WHERE id IN (?,?)', [userId, adminId]);
          await tx.execute('DELETE FROM career_cycles WHERE career_id=?', [careerId]);
          await tx.execute('DELETE FROM careers WHERE id=?', [careerId]);
        });
      } finally { await database.close(); }
    }
  }
});
