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
      score: null, contribution: 0, reason: name === 'level' ? 'DATA_NOT_MODELED' : 'INSUFFICIENT_DATA' });
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

test('recommendations use effective future availability and valid completed-session reviews without renormalizing', async () => {
  const monday = '2026-11-09 15:00:00.000000'; // 10:00 in America/Lima.
  const inputs = { learning: [skillA], mentors: [{ id: first, firstName: 'Alfa', lastName: 'Uno', skills: [skillA],
    availability: { now: monday, slots: [{ weekday: 1, start: '10:00', end: '12:00' }],
      busy: [{ starts_at: '2026-11-09 15:30:00.000000', ends_at: '2026-11-09 16:00:00.000000' }] },
    quality: { completed_sessions: 3, reviewed_sessions: 2, average_rating: '4.0000' },
  }] };
  const result = await service(inputs).recommendations(viewer, {});
  assert.equal(result.rankingStatus, 'PARTIAL');
  assert.deepEqual(result.missingSignals, ['level']);
  assert.equal(result.recommendations[0].score, 71.75);
  assert.equal(result.recommendations[0].evidenceCoverage, 80);
  assert.deepEqual(result.recommendations[0].components.availability, { weight: 25, available: true,
    score: 0.75, contribution: 18.75, evidence: { configuredMinutes: 120, bookableMinutes: 90,
      horizon: 'NEXT_WEEKLY_OCCURRENCE' } });
  assert.deepEqual(result.recommendations[0].components.quality, { weight: 10, available: true,
    score: 0.8, contribution: 8, evidence: { completedSessions: 3, reviewedSessions: 2, averageRating: 4 } });
  assert.equal(result.recommendations[0].components.level.reason, 'DATA_NOT_MODELED');
});

test('explore query accepts only bounded search, category, skill and stable pagination controls', async () => {
  const result = await service().mentors(viewer, { q: ' Datos ', category: 'Digital', skillId: skillA.id,
    limit: '5' });
  assert.equal(result.id, viewer);
  assert.deepEqual(result.page, { q: 'Datos', category: 'Digital', skillId: skillA.id,
    limit: 5, cursor: null });
  assert.throws(() => service().mentors(viewer, { userId: first }), error => error.code === 'VALIDATION_ERROR');
});
