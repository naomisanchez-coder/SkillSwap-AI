import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentRepository } from '../src/modules/student/student.repository.js';
import { createExploreRepository } from '../src/modules/student/explore.repository.js';
import { sessionCosts } from '../src/modules/student/booking.validation.js';

test('contrato React: créditos conserva suma y retención, agrega estado del movimiento y totales auditables', async () => {
  const calls = [];
  const database = {
    async execute(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('transaction_count')) return [[{ available: '15', held: '5', used: '10', earned: '0', transaction_count: 2 }]];
      return [[{ id: 'transaction-id', amount: -5, reason: 'SESSION_HOLD', operation_reference: 'session:session-id:hold', hold_status: 'HELD', cursor_time: '2026-11-11 10:00:00.000000' }]];
    },
    async transaction(work) { return work(this); },
  };
  const credits = await createStudentRepository(database).creditsOwn('viewer', { limit: 20, cursor: null });
  assert.equal(credits.total, 20); assert.equal(credits.available, 15); assert.equal(credits.held, 5);
  assert.equal(credits.used, 10); assert.equal(credits.earned, 0);
  assert.equal(credits.transactions[0].holdStatus, 'HELD');
  assert.equal(credits.transactions[0].occurredAt, '2026-11-11T10:00:00.000000Z');
  assert.ok(calls.every(call => call.values[0] === 'viewer'));
  assert.ok(calls.every(call => /^SELECT/.test(call.sql)));
});

test('contrato React: catálogo expone offerId y la política de costos sin cambiar identidad de habilidad', async () => {
  const calls = [];
  const database = { async execute(sql, values) {
    calls.push({ sql, values });
    if (sql.includes('mo.id offer_id')) return [[{ user_id: 'mentor', offer_id: 'offer', id: 'skill', code: 'demo', name: 'Habilidad demo', category: 'Demo', level_code: null }]];
    return [[{ id: 'mentor', first_name: 'Mentor', last_name: 'Demo', career: 'Software', cycle: 1, bio: null }]];
  } };
  const result = await createExploreRepository(database).mentors('viewer', { limit: 20 });
  assert.equal(result.mentors[0].id, 'mentor');
  assert.equal(result.mentors[0].skills[0].id, 'skill');
  assert.equal(result.mentors[0].skills[0].offerId, 'offer');
  assert.deepEqual(result.mentors[0].skills[0].costByDuration, sessionCosts);
  assert.equal(result.mentors[0].skills[0].level, null);
  assert.ok(calls.every(call => /^SELECT/.test(call.sql)));
});

test('configuración demo: las plantillas vacías heredan claves privadas sin sustituir la identidad demo', async () => {
  const { mergeDemoValues } = await import('../scripts/start-integrated-demo.js');
  const values = mergeDemoValues({ SESSION_CSRF_KEY_HEX: 'a'.repeat(64), PASSWORD_RECOVERY_HMAC_KEY_VERSION: 'v1', DB_NAME: 'skillswap_ai' }, { SESSION_CSRF_KEY_HEX: '', PASSWORD_RECOVERY_HMAC_KEY_VERSION: '', DB_NAME: 'skillswap_ai_demo', SMTP_ENABLED: 'false' });
  assert.equal(values.SESSION_CSRF_KEY_HEX, 'a'.repeat(64));
  assert.equal(values.PASSWORD_RECOVERY_HMAC_KEY_VERSION, 'v1');
  assert.equal(values.DB_NAME, 'skillswap_ai_demo');
  assert.equal(values.SMTP_ENABLED, 'false');
});

test('sesiones entregan fechas reales para el comprobante sin fabricar confirmaciones', async () => {
  const { createBookingRepository } = await import('../src/modules/student/booking.repository.js');
  const created = new Date('2026-11-11T10:00:00Z');
  const repo = createBookingRepository({ async execute() { return [[{ id: 'session', student_user_id: 'student', mentor_user_id: 'mentor', status: 'UPCOMING', starts_at: new Date('2026-11-12T22:00:00Z'), ends_at: new Date('2026-11-12T22:30:00Z'), created_at: created, duration_minutes: 30, credit_cost: 5, performed_at: null, validated_at: null, cancelled_at: null }]]; } });
  const result = await repo.session('student', 'session');
  assert.equal(result.createdAt, created.toISOString());
  assert.equal(result.performedAt, null); assert.equal(result.validatedAt, null);
  assert.equal(result.cancelledAt, null); assert.equal(result.startedAt, null);
});
