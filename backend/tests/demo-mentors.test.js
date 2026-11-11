import test from 'node:test';
import assert from 'node:assert/strict';
import { readDemoMentors, validateDemoMentors } from '../database/demo-mentors.js';

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
