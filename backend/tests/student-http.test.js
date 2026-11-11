import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { PublicError } from '../src/errors/PublicError.js';

const token = 'a'.repeat(64), csrf = 'b'.repeat(64);
const profile = { id: 'student-id', firstName: 'Ada', lastName: 'Lovelace', email: 'ada.test@tecsup.edu.pe',
  institution: 'TECSUP', role: 'student', emailVerified: true, career: 'Software', careerCode: 'software',
  cycle: 3, bio: null, interests: [], level: null, goals: null, schedule: null, onboardingComplete: false };

async function withApp({ role = 'student', configured = true } = {}, work) {
  const calls = [];
  const sessionService = configured ? {
    async authenticate(value) { calls.push(['auth', value]); return { user: { ...profile, role }, session: {}, inspected: {} }; },
    async validateCsrf(auth, value, supplied) { calls.push(['csrf', auth.user.id, value, supplied]); if (supplied !== csrf) throw new PublicError('CSRF_INVALID'); },
  } : undefined;
  const studentService = configured ? {
    async profile(id) { calls.push(['profile', id]); return profile; },
    async updateProfile(id, body) { calls.push(['update', id, body]); return { ...profile, ...body }; },
    async onboarding(id) { calls.push(['onboarding', id]); return { interests: [], level: null, schedule: null, complete: false }; },
    async completeOnboarding(id, body) { calls.push(['complete', id, body]); return { ...body, complete: true }; },
    async catalog() { calls.push(['catalog']); return { careers: [] }; },
    async credits(id, query) { calls.push(['credits', id, query]); return { balance: 20, totalTransactions: 1,
      transactions: [], pagination: { limit: 20, nextCursor: null } }; },
    async dashboard(id, query) { calls.push(['dashboard', id, query]); return { student: {
      firstName: profile.firstName, lastName: profile.lastName, career: profile.career, cycle: profile.cycle,
      onboardingComplete: profile.onboardingComplete }, credits: { balance: 20 },
    activity: { creditTransactions: 1 } }; },
  } : undefined;
  const mentorService = configured ? {
    requirements() { return { certificate: { required: true } }; },
    async catalog() { calls.push(['skill-catalog']); return []; },
    async ownSkills(id) { calls.push(['skills', id]); return []; },
    async setOwnSkill(id, skillId, body) { calls.push(['set-skill', id, skillId, body]); return { skillId, ...body }; },
    async applications(id) { calls.push(['applications', id]); return []; },
    async createApplication(id, multipart) { calls.push(['create-application', id, multipart]);
      if (!multipart.files.certificate) throw new PublicError('VALIDATION_ERROR', { certificate: 'Requerido.' });
      return { id: 'application', status: 'PENDING' }; },
    async replaceCertificate() { return { id: 'application', status: 'PENDING' }; },
    async resubmit() { return { id: 'application', status: 'PENDING' }; },
    async document() { return { buffer: Buffer.from('%PDF-test'), mediaType: 'application/pdf' }; },
    async savePhoto(id, multipart) { calls.push(['photo', id, multipart]); return { available: true }; },
    async photo() { return { buffer: Buffer.from('image'), mediaType: 'image/png' }; },
    async deletePhoto() { return { deleted: true }; },
  } : undefined;
  const app = createApp({ database: { check: async () => {} }, origins: ['http://localhost:5173'],
    sessionService, studentService, mentorService, cookie: { name: 'skillswap_session' } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try { await work(`http://127.0.0.1:${server.address().port}`, calls); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('student profile requires a valid STUDENT session and derives ownership from it', async () => {
  await withApp({}, async (base, calls) => {
    assert.equal((await fetch(`${base}/api/student/profile`)).status, 401);
    const response = await fetch(`${base}/api/student/profile`, { headers: { Cookie: `skillswap_session=${token}` } });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { profile });
    assert.ok(calls.some(call => call[0] === 'profile' && call[1] === profile.id));
  });
  await withApp({ role: 'admin' }, async base => {
    assert.equal((await fetch(`${base}/api/student/profile`, { headers: { Cookie: `skillswap_session=${token}` } })).status, 403);
  });
});

test('student mutations require approved origin, JSON and session-bound CSRF', async () => {
  await withApp({}, async (base, calls) => {
    const request = (headers) => fetch(`${base}/api/student/profile`, { method: 'PATCH', headers: {
      Cookie: `skillswap_session=${token}`, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ bio: 'Perfil académico' }) });
    assert.equal((await request()).status, 403);
    assert.equal((await request({ 'X-CSRF-Token': csrf, Origin: 'https://evil.invalid' })).status, 403);
    const response = await request({ 'X-CSRF-Token': csrf, Origin: 'http://localhost:5173' });
    assert.equal(response.status, 200);
    assert.ok(calls.some(call => call[0] === 'update' && call[1] === profile.id));
  });
});

test('onboarding and catalog expose only the authenticated student contracts', async () => {
  await withApp({}, async base => {
    const headers = { Cookie: `skillswap_session=${token}` };
    assert.equal((await fetch(`${base}/api/student/onboarding`, { headers })).status, 200);
    assert.equal((await fetch(`${base}/api/student/catalog`, { headers })).status, 200);
    const done = await fetch(`${base}/api/student/onboarding`, { method: 'PUT', headers: { ...headers,
      'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Origin: 'http://localhost:5173' },
    body: JSON.stringify({ interests: ['Python'], level: 'Intermedio', schedule: 'Tardes' }) });
    assert.equal(done.status, 200); assert.equal((await done.json()).onboarding.complete, true);
  });
});

test('student endpoints fail closed when the module is not configured', async () => {
  await withApp({ configured: false }, async base => {
    assert.equal((await fetch(`${base}/api/student/profile`, { headers: { Cookie: `skillswap_session=${token}` } })).status, 503);
  });
});

test('dashboard and credits are read-only, session-owned and available without CSRF', async () => {
  await withApp({}, async (base, calls) => {
    const headers = { Cookie: `skillswap_session=${token}` };
    const dashboard = await fetch(`${base}/api/student/dashboard`, { headers });
    const credits = await fetch(`${base}/api/student/credits?limit=20`, { headers });
    assert.equal(dashboard.status, 200);
    assert.equal(credits.status, 200);
    assert.equal((await dashboard.json()).dashboard.credits.balance, 20);
    assert.equal((await credits.json()).credits.balance, 20);
    assert.ok(calls.some(call => call[0] === 'dashboard' && call[1] === profile.id));
    assert.ok(calls.some(call => call[0] === 'credits' && call[1] === profile.id));
    assert.equal((await fetch(`${base}/api/student/credits`, { method: 'POST', headers })).status, 404);
  });
});

test('mentor application and photo multipart routes require owner session and CSRF', async () => {
  await withApp({}, async (base, calls) => {
    const form = new FormData();
    form.set('skillId', '123e4567-e89b-12d3-a456-426614174000');
    form.set('certificate', new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' }), 'certificate.pdf');
    const response = await fetch(`${base}/api/student/mentor-applications`, { method: 'POST', headers: {
      Cookie: `skillswap_session=${token}`, Origin: 'http://localhost:5173', 'X-CSRF-Token': csrf }, body: form });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).application.status, 'PENDING');
    assert.ok(calls.some(call => call[0] === 'create-application' && call[1] === profile.id &&
      call[2].files.certificate.mediaType === 'application/pdf'));

    const photo = new FormData();
    photo.set('photo', new Blob(['image'], { type: 'image/png' }), 'photo.png');
    assert.equal((await fetch(`${base}/api/student/profile/photo`, { method: 'PUT', headers: {
      Cookie: `skillswap_session=${token}`, Origin: 'http://localhost:5173', 'X-CSRF-Token': csrf }, body: photo })).status, 200);
    assert.equal((await fetch(`${base}/api/student/profile/photo`, { method: 'DELETE', headers: {
      Cookie: `skillswap_session=${token}`, Origin: 'http://localhost:5173', 'X-CSRF-Token': csrf } })).status, 200);
  });
  await withApp({ role: 'admin' }, async base => {
    assert.equal((await fetch(`${base}/api/student/skills`, { headers: {
      Cookie: `skillswap_session=${token}` } })).status, 403);
  });
});
