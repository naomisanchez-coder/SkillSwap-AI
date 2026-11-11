import test from 'node:test';
import assert from 'node:assert/strict';
import { createExploreService, recommendationWeights } from '../src/modules/student/explore.service.js';

const viewer = '123e4567-e89b-12d3-a456-426614174000';
const first = '223e4567-e89b-12d3-a456-426614174000';
const second = '323e4567-e89b-12d3-a456-426614174000';
const skillA = { id: '423e4567-e89b-12d3-a456-426614174000', code: 'a', name: 'A', category: null };
const skillB = { id: '523e4567-e89b-12d3-a456-426614174000', code: 'b', name: 'B', category: null };

function service(inputs = { learning: [skillA, skillB], mentors: [
  { id: first, firstName: 'Zeta', lastName: 'Uno', skills: [skillA] },
  { id: second, firstName: 'Alfa', lastName: 'Dos', skills: [skillA, skillB] },
] }) {
  return createExploreService({ async catalog(page) { return page; }, async mentors(id, page) { return { id, page }; },
    async mentor(id, mentorId) { return { id, mentorId }; }, async recommendationInputs() { return inputs; } });
}

test('recommendations preserve approved weights and expose unavailable signals without invented values', async () => {
  assert.deepEqual(recommendationWeights, { skill: 45, level: 20, availability: 25, quality: 10 });
  const result = await service().recommendations(viewer, {});
  assert.equal(result.rankingStatus, 'PARTIAL');
  assert.deepEqual(result.missingSignals, ['level', 'availability', 'quality']);
  assert.deepEqual(result.recommendations.map(item => [item.mentor.id, item.score]), [[second, 45], [first, 22.5]]);
  for (const item of result.recommendations) for (const name of result.missingSignals) {
    assert.deepEqual(item.components[name], { weight: recommendationWeights[name], available: false,
      score: null, contribution: 0, reason: 'DATA_NOT_MODELED' });
  }
});
test('recommendations are empty without declared learning skills and query contracts fail closed', async () => {
  const empty = await service({ learning: [], mentors: [] }).recommendations(viewer, { limit: '10' });
  assert.equal(empty.rankingStatus, 'INSUFFICIENT_DATA');
  assert.deepEqual(empty.recommendations, []);
  await assert.rejects(service().recommendations(viewer, { quality: '5' }), error => error.code === 'VALIDATION_ERROR');
  assert.throws(() => service().catalog({ cursor: 'not-canonical' }), error => error.code === 'VALIDATION_ERROR');
  assert.throws(() => service().mentor(viewer, 'not-a-uuid'), error => error.code === 'VALIDATION_ERROR');
});

test('explore query accepts only bounded search, category, skill and stable pagination controls', async () => {
  const result = await service().mentors(viewer, { q: ' Datos ', category: 'Digital', skillId: skillA.id,
    limit: '5' });
  assert.equal(result.id, viewer);
  assert.deepEqual(result.page, { q: 'Datos', category: 'Digital', skillId: skillA.id,
    limit: 5, cursor: null });
  assert.throws(() => service().mentors(viewer, { userId: first }), error => error.code === 'VALIDATION_ERROR');
});
