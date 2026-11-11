import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCreditsQuery, validateDashboardQuery, validateInterests, validateOnboarding, validateProfilePatch,
  onboardingComplete } from '../src/modules/student/student.validation.js';
import { createStudentService } from '../src/modules/student/student.service.js';

test('profile validation accepts confirmed fields and rejects ownership or privileged fields', () => {
  assert.deepEqual(validateProfilePatch({ firstName: ' Ada ', lastName: ' Lovelace ', bio: '',
    career: 'Diseño y Desarrollo de Software', cycle: 3 }), {
    firstName: 'Ada', lastName: 'Lovelace', bio: null,
    career: 'Diseño y Desarrollo de Software', cycle: 3,
  });
  for (const body of [{}, { userId: 'other' }, { role: 'ADMIN' }, { credits: 999 },
    { emailVerified: true }, { email: 'otro@tecsup.edu.pe' }, { career: 'X' }, { cycle: 2 }]) {
    assert.throws(() => validateProfilePatch(body), error => error.code === 'VALIDATION_ERROR');
  }
});

test('interests are bounded, ordered and unique while onboarding requires confirmed fields', () => {
  assert.deepEqual(validateInterests([' Python ', 'Excel']), ['Python', 'Excel']);
  assert.deepEqual(validateOnboarding({ interests: ['Python'], level: 'Intermedio',
    schedule: 'Tardes entre semana' }), { interests: ['Python'], level: 'Intermedio',
    schedule: 'Tardes entre semana' });
  for (const interests of [[], ['Python', 'python'], Array.from({ length: 11 }, (_, i) => `Skill ${i}`)]) {
    assert.throws(() => validateInterests(interests, { required: true }),
      error => error.code === 'VALIDATION_ERROR');
  }
  assert.equal(onboardingComplete({ interests: ['Python'], level: 'Intermedio', schedule: 'Tardes' }), true);
  assert.equal(onboardingComplete({ interests: [], level: 'Intermedio', schedule: 'Tardes' }), false);
});

test('student service always scopes reads and mutations to the authenticated identifier', async () => {
  const calls = [];
  const profile = { interests: ['Python'], level: 'Intermedio', schedule: 'Tardes', onboardingComplete: true };
  const service = createStudentService({
    async findOwn(id) { calls.push(['find', id]); return profile; },
    async updateOwn(id, patch) { calls.push(['update', id, patch]); return { ...profile, ...patch, onboardingComplete: true }; },
    async catalog() { calls.push(['catalog']); return [{ code: 'software', name: 'Software', cycles: [1, 2] }]; },
    async creditsOwn(id, page) { calls.push(['credits', id, page]); return { balance: 20, totalTransactions: 1,
      transactions: [], pagination: { limit: page.limit, nextCursor: null } }; },
  });
  assert.equal((await service.profile('session-user')).onboardingComplete, true);
  assert.equal((await service.completeOnboarding('session-user', { interests: ['Python'],
    level: 'Intermedio', schedule: 'Tardes' })).complete, true);
  assert.deepEqual(await service.catalog(), { careers: [{ code: 'software', name: 'Software', cycles: [1, 2] }] });
  assert.equal((await service.credits('session-user', {})).balance, 20);
  assert.equal((await service.dashboard('session-user', {})).credits.balance, 20);
  assert.ok(calls.filter(call => call[0] === 'credits').every(call => call[1] === 'session-user'));
});

test('credit pagination accepts bounded canonical values and opaque cursors only', () => {
  assert.deepEqual(validateCreditsQuery({}), { limit: 20, cursor: null });
  assert.deepEqual(validateCreditsQuery({ limit: '50' }), { limit: 50, cursor: null });
  const value = ['2026-11-10 12:34:56.123456', '123e4567-e89b-12d3-a456-426614174000'];
  const cursor = Buffer.from(JSON.stringify(value)).toString('base64url');
  assert.deepEqual(validateCreditsQuery({ limit: '2', cursor }), {
    limit: 2, cursor: { createdAt: value[0], id: value[1] },
  });
  for (const query of [{ userId: 'other' }, { limit: '0' }, { limit: '51' }, { limit: '02' },
    { cursor: 'not-a-cursor' }, { limit: ['2', '3'] }]) {
    assert.throws(() => validateCreditsQuery(query), error => error.code === 'VALIDATION_ERROR');
  }
  assert.doesNotThrow(() => validateDashboardQuery({}));
  assert.throws(() => validateDashboardQuery({ userId: 'other' }), error => error.code === 'VALIDATION_ERROR');
});
