import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInterests, validateOnboarding, validateProfilePatch,
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
  });
  assert.equal((await service.profile('session-user')).onboardingComplete, true);
  assert.equal((await service.completeOnboarding('session-user', { interests: ['Python'],
    level: 'Intermedio', schedule: 'Tardes' })).complete, true);
  assert.deepEqual(await service.catalog(), { careers: [{ code: 'software', name: 'Software', cycles: [1, 2] }] });
  assert.deepEqual(calls.map(call => call[1]).filter(Boolean), ['session-user', 'session-user']);
});
