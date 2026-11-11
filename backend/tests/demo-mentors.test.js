import test from 'node:test';
import assert from 'node:assert/strict';
import { readDemoMentors, validateDemoMentors } from '../database/demo-mentors.js';
import { inspectDemoEnvironment } from '../database/demo-environment.js';

test('demo mentor manifest is explicit, isolated and references no invented academic structures', async () => {
  const catalog = await readDemoMentors();
  assert.equal(catalog.scope, 'DEMO_ONLY');
  assert.equal(catalog.mentors.length, 3);
  assert.deepEqual(catalog.mentors.map(item => item.key), [
    'diego-ramirez-torres', 'valeria-mendoza-flores', 'andres-castillo-vega',
  ]);
  assert.ok(catalog.mentors.every(item => item.bio.includes('ficticio') &&
    !Object.hasOwn(item, 'area') && !Object.hasOwn(item, 'faculty')));
  assert.throws(() => validateDemoMentors({ ...catalog, scope: 'APPROVED' }), /Invalid demo mentor manifest/);
});

test('demo environment inspection requires three verified approved mentors and one internal admin', async () => {
  const rows = (await readDemoMentors()).mentors.map((mentor, index) => ({
    id: `mentor-${index}`, first_name: mentor.firstName, last_name: mentor.lastName,
    email: `demo.${['diego', 'valeria', 'andres'][index]}@tecsup.edu.pe`, role: 'STUDENT', status: 'ACTIVE',
    career_code: mentor.careerCode, cycle: mentor.cycle, skill_code: mentor.skillCode,
    email_verified_at: new Date(), application_status: 'APPROVED', offer_status: 'ACTIVE',
    level_code: mentor.levelCode, has_photo: 1,
    schedule: mentor.availability.map(slot => `${slot.weekday}|${slot.start}|${slot.end}`).join(','),
  })).sort((left, right) => left.email.localeCompare(right.email));
  const admin = { id: 'admin', role: 'ADMIN', status: 'ACTIVE', email_verified_at: new Date() };
  const database = { calls: 0, async execute() { this.calls++; return [this.calls === 1 ? rows : [admin]]; } };
  const complete = await inspectDemoEnvironment(database);
  assert.equal(complete.complete, true);
  rows[0].application_status = 'PENDING';
  const pendingDatabase = { calls: 0, async execute() { this.calls++; return [this.calls === 1 ? rows : [admin]]; } };
  assert.equal((await inspectDemoEnvironment(pendingDatabase)).complete, false);
});
