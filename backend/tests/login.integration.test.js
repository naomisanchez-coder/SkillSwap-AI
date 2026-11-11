import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDatabase } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/modules/auth/password.service.js';
import { createLoginRateIdentifiers } from '../src/modules/auth/login-rate.js';
import { createLoginRateRepository } from '../src/modules/auth/login-rate.repository.js';
import { createSessionProtection } from '../src/modules/auth/session-security.js';
import { createSessionRepository } from '../src/modules/auth/session.repository.js';
import { createSessionService } from '../src/modules/auth/session.service.js';
import { createLoginService } from '../src/modules/auth/login.service.js';
import { sessionPolicy } from '../src/config/session-security.js';

const requested = Object.keys(process.env).some(key => key.startsWith('DATABASE_TEST_'));
test('real isolated login persists secure sessions, expiry, CSRF, roles, limits and restart recovery', {
  skip: requested ? false : 'isolated MySQL login integration pending', timeout: 60000,
}, async () => {
  assert.equal(process.env.DATABASE_TEST_DB, 'skillswap_ai_test_auth');
  assert.equal(process.env.DATABASE_TEST_USER, 'skillswap_test_app');
  let db, server; const careerId = randomUUID(); const users = [];
  const letters = () => [...randomBytes(10)].map(n => String.fromCharCode(97 + n % 26)).join('');
  const email = prefix => `${prefix}.${letters()}@tecsup.edu.pe`;
  const password = `Login-${randomBytes(12).toString('hex')}`;
  const rateKey = randomBytes(32).toString('hex'); const csrfKey = randomBytes(32).toString('hex');
  const identifiers = createLoginRateIdentifiers(rateKey); const protection = createSessionProtection(csrfKey);
  const trackedEmails = [];
  const origin = 'http://localhost:5173'; const ip = '127.0.0.1';
  const start = async app => { const current = app.listen(0, '127.0.0.1');
    await new Promise(resolve => current.once('listening', resolve)); return current; };
  const stop = async current => { if (current) await new Promise(resolve => current.close(resolve)); };
  try {
    db = createDatabase({ host: '127.0.0.1', port: 3306, database: process.env.DATABASE_TEST_DB,
      user: process.env.DATABASE_TEST_USER, password: process.env.DATABASE_TEST_PASSWORD });
    const [[identity]] = await db.execute('SELECT CURRENT_USER() AS account,DATABASE() AS db');
    assert.equal(identity.account, 'skillswap_test_app@127.0.0.1'); assert.equal(identity.db, 'skillswap_ai_test_auth');
    const encoded = await hashPassword(password); const now = new Date();
    const fixture = async ({ role = 'STUDENT', status = 'ACTIVE', verified = true, prefix = 'login' } = {}) => {
      const item = { id: randomUUID(), email: role === 'ADMIN' ? `${prefix}.${letters()}@example.invalid` : email(prefix), role, status };
      users.push(item); trackedEmails.push(item.email);
      await db.transaction(async tx => {
        await tx.execute(`INSERT INTO users (id,first_name,last_name,email,password_hash,role,status,email_verified_at,
          terms_accepted_at,terms_version,privacy_version,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [item.id, role === 'ADMIN' ? 'Admin' : 'Prueba', 'Aislada', item.email, encoded, role, status,
          verified ? now : null, role === 'STUDENT' ? now : null, role === 'STUDENT' ? 'test' : null,
          role === 'STUDENT' ? 'test' : null, now]);
        if (role === 'STUDENT') await tx.execute(
          'INSERT INTO student_profiles (user_id,career_id,cycle,onboarding_complete) VALUES (?,?,?,?)',
          [item.id, careerId, 2, false]);
      });
      return item;
    };
    await db.transaction(async tx => { await tx.execute('INSERT INTO careers (id,code,name) VALUES (?,?,?)',
      [careerId, `LOGIN_${careerId}`, 'Login aislado']); await tx.execute(
      'INSERT INTO career_cycles (career_id,cycle) VALUES (?,?)', [careerId, 2]); });
    const active = await fixture(); const pending = await fixture({ status: 'PENDING_VERIFICATION', verified: false, prefix: 'pending' });
    const suspended = await fixture({ status: 'SUSPENDED', prefix: 'suspended' });
    const admin = await fixture({ role: 'ADMIN', prefix: 'admin' });
    const rateRepository = createLoginRateRepository(db); const sessionRepository = createSessionRepository(db, sessionPolicy);
    const sessionService = createSessionService(sessionRepository, protection);
    const loginService = createLoginService({ sessionRepository, rateRepository, identifiers, protection });
    const options = { database: db, origins: [origin], loginService, sessionService,
      cookie: { name: sessionPolicy.cookieName, secure: false,
        rememberMaxAge: sessionPolicy.remembered.absoluteSeconds * 1000 }, trustProxyHops: 0 };
    server = await start(createApp(options)); let base = `http://127.0.0.1:${server.address().port}`;
    const login = (address, secret = password, remember = false) => fetch(`${base}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Protection': '1', Origin: origin,
        'X-Forwarded-For': '203.0.113.50' }, body: JSON.stringify({ email: address, password: secret, remember }) });
    const valid = await login(active.email); assert.equal(valid.status, 200); const validBody = await valid.json();
    assert.equal(validBody.user.role, 'student'); assert.equal(validBody.user.institution, 'TECSUP');
    assert.equal(validBody.user.career, 'Login aislado'); assert.equal(validBody.user.cycle, 2);
    assert.match(validBody.csrfToken, /^[0-9a-f]{64}$/); const cookie = valid.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.doesNotMatch(cookie, /Max-Age/);
    const token = cookie.match(/^skillswap_session=([0-9a-f]{64})/)[1];
    const [[regular]] = await db.execute(`SELECT remember,TIMESTAMPDIFF(SECOND,created_at,idle_expires_at) AS idle,
      TIMESTAMPDIFF(SECOND,created_at,absolute_expires_at) AS absolute FROM auth_sessions WHERE id_hash=UNHEX(SHA2(?,256))`, [token]);
    assert.equal(regular.remember, 0); assert.equal(Number(regular.idle), 1800); assert.equal(Number(regular.absolute), 28800);
    await stop(server); server = await start(createApp(options)); base = `http://127.0.0.1:${server.address().port}`;
    const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: `skillswap_session=${token}`, Origin: origin } });
    assert.equal(me.status, 200); assert.deepEqual(await me.json(), validBody);
    const wrongCsrf = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: {
      Cookie: `skillswap_session=${token}`, 'X-CSRF-Token': '0'.repeat(64), Origin: origin } });
    assert.equal(wrongCsrf.status, 403);
    const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: {
      Cookie: `skillswap_session=${token}`, 'X-CSRF-Token': validBody.csrfToken, Origin: origin } });
    assert.equal(logout.status, 200); assert.equal((await fetch(`${base}/api/auth/me`, { headers: {
      Cookie: `skillswap_session=${token}` } })).status, 401);

    const remembered = await login(active.email, password, true); assert.equal(remembered.status, 200);
    assert.match(remembered.headers.get('set-cookie'), /Max-Age=2592000/);
    const rememberedToken = remembered.headers.get('set-cookie').match(/^skillswap_session=([0-9a-f]{64})/)[1];
    const [[longSession]] = await db.execute(`SELECT remember,TIMESTAMPDIFF(SECOND,created_at,idle_expires_at) AS idle,
      TIMESTAMPDIFF(SECOND,created_at,absolute_expires_at) AS absolute FROM auth_sessions WHERE id_hash=UNHEX(SHA2(?,256))`, [rememberedToken]);
    assert.equal(longSession.remember, 1); assert.equal(Number(longSession.idle), 604800); assert.equal(Number(longSession.absolute), 2592000);

    const missingEmail = email('missing'); trackedEmails.push(missingEmail);
    const badExisting = await login(active.email, 'incorrect'); const badMissing = await login(missingEmail, 'incorrect');
    assert.equal(badExisting.status, 401); assert.equal(badMissing.status, 401);
    assert.deepEqual(await badExisting.json(), await badMissing.json());
    assert.equal((await login(pending.email)).status, 403); assert.equal((await login(suspended.email)).status, 403);
    const adminLogin = await login(admin.email); assert.equal(adminLogin.status, 200); const adminBody = await adminLogin.json();
    assert.equal(adminBody.user.role, 'admin'); assert.equal(adminBody.user.institution, null);
    assert.equal(adminBody.user.career, null); assert.equal(adminBody.user.cycle, null);

    for (const kind of ['idle', 'absolute']) {
      const issued = protection.issue(); await sessionRepository.create({ idHash: issued.idHash,
        csrfHmac: issued.csrfHmac, userId: active.id, remember: false });
      const values = kind === 'idle'
        ? [new Date(Date.now()-40*60000),new Date(Date.now()-31*60000),new Date(Date.now()-60000),new Date(Date.now()+7*3600000),issued.idHash]
        : [new Date(Date.now()-9*3600000),new Date(Date.now()-8*3600000),new Date(Date.now()-7.5*3600000),new Date(Date.now()-3600000),issued.idHash];
      await db.execute('UPDATE auth_sessions SET created_at=?,last_seen_at=?,idle_expires_at=?,absolute_expires_at=? WHERE id_hash=?', values);
      await assert.rejects(sessionService.me(issued.token), error => error.code === 'SESSION_REQUIRED');
      const [[expired]] = await db.execute('SELECT revoked_at FROM auth_sessions WHERE id_hash=?', [issued.idHash]); assert.ok(expired.revoked_at);
    }
    const ids = users.map(item => item.id); const placeholders = ids.map(() => '?').join(',');
    const [[credits]] = await db.execute(`SELECT COUNT(*) AS total FROM credit_transactions WHERE user_id IN (${placeholders})`, ids);
    assert.equal(Number(credits.total), 0);
  } finally {
    await stop(server);
    if (db) {
      try {
        const ids = users.map(item => item.id); const placeholders = ids.map(() => '?').join(',');
        await db.transaction(async tx => {
          if (ids.length) { await tx.execute(`DELETE FROM auth_sessions WHERE user_id IN (${placeholders})`, ids);
            await tx.execute(`DELETE FROM credit_transactions WHERE user_id IN (${placeholders})`, ids);
            await tx.execute(`DELETE FROM email_verifications WHERE user_id IN (${placeholders})`, ids);
            await tx.execute(`DELETE FROM student_profiles WHERE user_id IN (${placeholders})`, ids);
            await tx.execute(`DELETE FROM users WHERE id IN (${placeholders})`, ids); }
          for (const address of trackedEmails) await tx.execute('DELETE FROM login_rate_limits WHERE scope=? AND identifier_hmac=?',
            ['EMAIL', identifiers.email(address)]);
          await tx.execute('DELETE FROM login_rate_limits WHERE scope=? AND identifier_hmac=?', ['IP', identifiers.ip(ip)]);
          await tx.execute('DELETE FROM career_cycles WHERE career_id=?', [careerId]);
          await tx.execute('DELETE FROM careers WHERE id=?', [careerId]);
        });
      } finally { await db.close(); }
    }
  }
});
