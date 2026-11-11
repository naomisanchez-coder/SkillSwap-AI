import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminService } from '../src/modules/admin/admin.service.js';

const admin = '123e4567-e89b-12d3-a456-426614174000';
const application = '223e4567-e89b-12d3-a456-426614174000';
const offer = '323e4567-e89b-12d3-a456-426614174000';

test('admin service validates exact decisions, levels, pagination and private document types', async () => {
  const calls = [];
  const service = createAdminService({ async pending(limit) { calls.push(['pending', limit]); return []; },
    async document(id, type) { calls.push(['document', id, type]); return { storage_key: 'x' }; },
    async decide(...args) { calls.push(['decide', ...args]); return {}; },
    async assignLevel(...args) { calls.push(['level', ...args]); return {}; } }, async value => value);
  await service.pending({ limit: '5' });
  await service.document(application, 'certificate');
  await service.decide(admin, application, { decision: 'approved', reason: ' Evidencia válida. ' });
  await service.assignLevel(admin, offer, { levelCode: 'demo-advanced' });
  assert.deepEqual(calls[0], ['pending', 5]);
  assert.deepEqual(calls[1], ['document', application, 'CERTIFICATE']);
  assert.deepEqual(calls[2].slice(0, 5), ['decide', admin, application, 'APPROVED', 'Evidencia válida.']);
  assert.deepEqual(calls[3], ['level', admin, offer, 'demo-advanced']);
  for (const work of [() => service.pending({ offset: '1' }),
    () => service.document(application, 'notes'),
    () => service.decide(admin, application, { decision: 'PENDING', reason: 'No' }),
    () => service.assignLevel(admin, offer, { levelCode: '../private' })]) {
    assert.throws(work, error => error.code === 'VALIDATION_ERROR');
  }
});
