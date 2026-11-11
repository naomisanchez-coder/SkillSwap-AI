import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalBookingStore, bookingStorageKey } from '../src/dev/bookingStore';
import { mentors } from '../src/dev/mentorFixtures';
import { getNextAvailableDates } from '../src/data/scheduling';
import { canCancelSession, sessionStartsAt, type SessionAction } from '../src/data/sessionLifecycle';
import { BookingError } from '../src/data/booking';

class MemoryStorage {
  values = new Map<string, string>(); fail = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw new Error('quota'); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
async function fixture() {
  const storage = new MemoryStorage(); let time = new Date('2030-04-01T12:00:00-05:00');
  const options = { storage: () => storage, routeStorage: () => storage, getMentors: () => mentors, identity: { id: 'current', name: 'Estudiante' }, initialWallet: { available: 20, held: 0, used: 0, earned: 0 }, now: () => time };
  const service = createLocalBookingStore(options);
  const command = { id: 'SES-test', mentorId: 'carlos', date: getNextAvailableDates(mentors[0].slots, 8, time)[0], time: '7:00 PM', duration: 30 as const };
  const { session } = await service.confirmBooking(command);
  const mentor = async (type: 'start' | 'perform' | 'close-incident') => service.applyMentorFixture({ type, sessionId: session.id, mentorId: session.mentorId });
  return { storage, service, session, options, command, mentor, setTime: (value: number) => { time = new Date(value); } };
}
const code = (value: string) => (error: unknown) => error instanceof BookingError && error.code === value;

test('cancelación: 12h exactas y 1ms antes permiten; 1ms después bloquea sin devolución', async () => {
  for (const delta of [-1, 0, 1]) {
    const f = await fixture(); const limit = sessionStartsAt(f.session) - 12 * 3_600_000;
    f.setTime(limit + delta);
    assert.equal(canCancelSession(f.session, new Date(limit + delta)), delta <= 0);
    if (delta <= 0) {
      await f.service.updateSession({ type: 'cancel', sessionId: f.session.id });
      assert.equal((await f.service.getLedger()).wallet.available, 20);
    } else {
      await assert.rejects(f.service.updateSession({ type: 'cancel', sessionId: f.session.id }), code('invalid_transition'));
      assert.equal((await f.service.getLedger()).wallet.held, 5);
    }
  }
});

test('devolución única concurrente, persistente y libera el intervalo para volver a reservar', async () => {
  const f = await fixture();
  await Promise.all(Array.from({ length: 8 }, () => f.service.updateSession({ type: 'cancel', sessionId: f.session.id })));
  const ledger = await createLocalBookingStore(f.options).getLedger();
  assert.equal(ledger.movements.filter(item => item.type === 'refund').length, 1);
  assert.equal(ledger.wallet.available, 20); assert.equal(ledger.wallet.held, 0);
  await f.service.confirmBooking({ ...f.command, id: 'SES-rebook' });
  assert.equal((await f.service.getLedger()).wallet.held, 5);
});

test('no libera sin mentor; dos confirmaciones con sus fechas liquidan solo una vez', async () => {
  const f = await fixture();
  await assert.rejects(f.service.updateSession({ type: 'validate', sessionId: f.session.id }), code('invalid_transition'));
  await assert.rejects(f.service.applyMentorFixture({ type: 'start', sessionId: f.session.id, mentorId: 'otro' }), code('invalid_transition'));
  await f.mentor('start'); await f.mentor('perform');
  const pending = await f.service.getLedger(); assert.equal(pending.wallet.held, 5); assert.equal(pending.sessions[0].validatedAt, undefined);
  f.setTime(Date.parse(pending.sessions[0].performedAt!) + 60_000);
  await Promise.all(Array.from({ length: 10 }, () => f.service.updateSession({ type: 'validate', sessionId: f.session.id })));
  const next = await createLocalBookingStore(f.options).getLedger();
  assert.equal(next.sessions[0].status, 'completed'); assert.notEqual(next.sessions[0].performedAt, next.sessions[0].validatedAt);
  assert.deepEqual(next.wallet, { available: 15, held: 0, used: 5, earned: 0 }); assert.equal(next.mentorBalances.carlos, 5);
  assert.equal(next.movements.filter(item => item.type === 'spent').length, 1); assert.equal(next.movements.filter(item => item.type === 'earning').length, 1);
  await assert.rejects(f.service.updateSession({ type: 'cancel', sessionId: f.session.id }), code('invalid_transition'));
});

test('discrepancia retiene créditos, impide validar/cancelar/valorar y reportes sucesivos tienen IDs distintos', async () => {
  const f = await fixture(); await f.mentor('start'); await f.mentor('perform');
  const report = { type: 'report', sessionId: f.session.id, category: 'completion_dispute', reason: 'No se realizó la sesión' } as const;
  await f.service.updateSession(report);
  for (const action of [{ type: 'validate', sessionId: f.session.id }, { type: 'cancel', sessionId: f.session.id }, { type: 'rate', sessionId: f.session.id, rating: 5, comment: '' }, report] as SessionAction[]) await assert.rejects(f.service.updateSession(action), code('invalid_transition'));
  assert.equal((await f.service.getLedger()).wallet.held, 5);
  await f.mentor('close-incident'); await f.service.updateSession(report);
  const ledger = await createLocalBookingStore(f.options).getLedger();
  assert.equal(ledger.sessions[0].status, 'review'); assert.equal(ledger.incidents.length, 2);
  assert.notEqual(ledger.incidents[0].id, ledger.incidents[1].id);
  assert.equal(ledger.movements.length, 1); assert.deepEqual(ledger.mentorBalances, {});
});

test('valoración única, comentario validado y conserva datos al recargar', async () => {
  const f = await fixture();
  await assert.rejects(f.service.updateSession({ type: 'rate', sessionId: f.session.id, rating: 5, comment: '' }), code('invalid_transition'));
  await f.mentor('start'); await f.mentor('perform'); await f.service.updateSession({ type: 'validate', sessionId: f.session.id });
  for (const [rating, comment] of [[0, ''], [6, ''], [2.5, ''], [5, 'x'.repeat(501)]] as [number, string][]) await assert.rejects(f.service.updateSession({ type: 'rate', sessionId: f.session.id, rating, comment }), code('invalid_transition'));
  const results = await Promise.allSettled([1, 2].map(() => f.service.updateSession({ type: 'rate', sessionId: f.session.id, rating: 4, comment: ' Gracias ' })));
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  const ledger = await createLocalBookingStore(f.options).getLedger(); assert.equal(ledger.reviews.length, 1); assert.equal(ledger.reviews[0].comment, 'Gracias'); assert.equal(ledger.sessions[0].rating, 4);
});

test('fallos de guardado: cancelación, confirmaciones, reporte y reseña no dejan cambios parciales', async () => {
  for (const kind of ['cancel', 'perform', 'validate', 'report', 'rate'] as const) {
    const f = await fixture();
    if (['perform', 'validate', 'rate'].includes(kind)) await f.mentor('start');
    if (['validate', 'rate'].includes(kind)) await f.mentor('perform');
    if (kind === 'rate') await f.service.updateSession({ type: 'validate', sessionId: f.session.id });
    const before = f.storage.getItem(bookingStorageKey);
    const run = () => kind === 'perform' ? f.mentor('perform') : f.service.updateSession(kind === 'rate' ? { type: 'rate', sessionId: f.session.id, rating: 5, comment: 'Bien' } : kind === 'report' ? { type: 'report', sessionId: f.session.id, category: 'connection', reason: 'Problema de conexión' } : { type: kind, sessionId: f.session.id });
    f.storage.fail = true; await assert.rejects(run(), code('storage_failed'));
    assert.equal(f.storage.getItem(bookingStorageKey), before);
    f.storage.fail = false; await run(); await createLocalBookingStore(f.options).getLedger();
  }
});

test('compatibilidad con reservas anteriores y detección de movimientos duplicados o saldo alterado', async () => {
  const f = await fixture(); const stored = JSON.parse(f.storage.getItem(bookingStorageKey)!);
  delete stored.incidents; delete stored.reviews; delete stored.mentorBalances;
  f.storage.setItem(bookingStorageKey, JSON.stringify(stored));
  assert.equal((await f.service.getLedger()).wallet.held, 5);
  await f.service.updateSession({ type: 'cancel', sessionId: f.session.id });
  const valid = f.storage.getItem(bookingStorageKey)!;
  for (const mutate of [(data: typeof stored) => data.movements.push(data.movements[0]), (data: typeof stored) => data.wallet.available++, (data: typeof stored) => data.mentorBalances.carlos = 100]) {
    const corrupt = JSON.parse(valid); mutate(corrupt); f.storage.setItem(bookingStorageKey, JSON.stringify(corrupt));
    await assert.rejects(f.service.getLedger(), code('storage_invalid'));
  }
});

test('cancelaciones y liquidaciones conservan costos 5/10/15 y no afectan créditos de otras sesiones', async () => {
  for (const duration of [30, 60, 90] as const) {
    for (const cancel of [true, false]) {
      const f = await fixture();
      await f.service.updateSession({ type: 'cancel', sessionId: f.session.id });
      const id = 'SES-cost'; const cost = duration / 6;
      await f.service.confirmBooking({ ...f.command, id, duration });
      if (cancel) await f.service.updateSession({ type: 'cancel', sessionId: id });
      else {
        await f.service.applyMentorFixture({ type: 'start', sessionId: id, mentorId: 'carlos' });
        await f.service.applyMentorFixture({ type: 'perform', sessionId: id, mentorId: 'carlos' });
        await f.service.updateSession({ type: 'validate', sessionId: id });
      }
      const ledger = await createLocalBookingStore(f.options).getLedger();
      assert.equal(ledger.wallet.available, cancel ? 20 : 20 - cost);
      assert.equal(ledger.wallet.held, 0); assert.equal(ledger.wallet.used, cancel ? 0 : cost);
      assert.equal(ledger.mentorBalances.carlos ?? 0, cancel ? 0 : cost);
      assert.equal(ledger.movements.find(item => item.reference === `${id}:${cancel ? 'refund' : 'earning'}`)?.amount, cost);
    }
  }
});

test('la entrada estudiantil rechaza acciones exclusivas del fixture de mentor', async () => {
  const f = await fixture(); const before = await f.service.getLedger();
  await assert.rejects(f.service.updateSession({ type: 'start', sessionId: f.session.id, mentorId: 'carlos' } as unknown as SessionAction), code('invalid_request'));
  await assert.rejects(f.service.updateSession({ type: 'cancel', sessionId: f.session.id, mentorId: 'carlos' } as unknown as SessionAction), code('invalid_request'));
  assert.deepEqual(await f.service.getLedger(), before);
});

test('cancelar una sesión y liquidar otra mantiene sus retenciones independientes', async () => {
  const f = await fixture();
  const date = getNextAvailableDates(mentors[0].slots, 8, new Date('2030-04-01T12:00:00-05:00'))[1];
  await f.service.confirmBooking({ ...f.command, id: 'SES-second', date, duration: 60 });
  assert.deepEqual((await f.service.getLedger()).wallet, { available: 5, held: 15, used: 0, earned: 0 });
  await f.service.updateSession({ type: 'cancel', sessionId: f.session.id });
  assert.deepEqual((await f.service.getLedger()).wallet, { available: 10, held: 10, used: 0, earned: 0 });
  await f.service.applyMentorFixture({ type: 'start', sessionId: 'SES-second', mentorId: 'carlos' });
  await f.service.applyMentorFixture({ type: 'perform', sessionId: 'SES-second', mentorId: 'carlos' });
  await f.service.updateSession({ type: 'validate', sessionId: 'SES-second' });
  const ledger = await createLocalBookingStore(f.options).getLedger();
  assert.deepEqual(ledger.wallet, { available: 10, held: 0, used: 10, earned: 0 });
  assert.equal(ledger.mentorBalances.carlos, 10);
});
