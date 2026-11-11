import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalBookingStore, bookingStorageKey } from '../src/dev/bookingStore';
import { mentors } from '../src/dev/mentorFixtures';
import { BookingError, type BookingCommand } from '../src/data/booking';
import { getNextAvailableDates, isWithinAvailability } from '../src/data/scheduling';

class MemoryStorage {
  values = new Map<string, string>();
  fail = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw new Error('storage failure'); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const now = () => new Date('2030-04-01T12:00:00-05:00');
function fixture(balance = 20) {
  const storage = new MemoryStorage();
  const route = new MemoryStorage();
  const catalog = structuredClone(mentors);
  const options = { storage: () => storage, routeStorage: () => route, getMentors: () => catalog, identity: { id: 'current', name: 'Estudiante' }, initialWallet: { available: balance, held: 0, used: 0, earned: 0 }, now };
  const service = createLocalBookingStore(options);
  const date = getNextAvailableDates(catalog[0].slots, 8, now())[0];
  const command: BookingCommand = { id: 'SES-test-1', mentorId: 'carlos', date, time: '7:00 PM', duration: 30 };
  return { service, storage, route, catalog, command, options };
}
const isCode = (code: string) => (error: unknown) => error instanceof BookingError && error.code === code;

test('reserva 30/60/90 minutos por 5/10/15: persiste sesión, retención y notificación juntas', async () => {
  for (const duration of [30, 60, 90] as const) {
    const { service, command, options, storage } = fixture();
    const cost = duration / 6;
    const confirmed = await service.confirmBooking({ ...command, duration });
    assert.equal(confirmed.session.credits, cost);
    assert.equal(confirmed.session.duration, duration);
    assert.equal(confirmed.session.date, command.date);
    assert.equal(confirmed.session.time, command.time);
    assert.deepEqual(confirmed.wallet, { available: 20 - cost, held: cost, used: 0, earned: 0 });
    const reloaded = createLocalBookingStore(options);
    assert.deepEqual(await reloaded.getBooking(command.id), confirmed.session);
    const ledger = await reloaded.getLedger();
    assert.equal(ledger.movements.length, 1);
    assert.equal(ledger.movements[0].reference, `${command.id}:hold`);
    assert.equal(ledger.movements[0].amount, -cost);
    assert.equal(ledger.sessions[0].reservedSlotKeys.length, duration / 30);
    assert.equal(ledger.notifications.length, 1);
    assert.equal(storage.values.size, 1);
  }
});

test('diez envíos concurrentes con el mismo ID producen una sola reserva y una retención', async () => {
  const { service, command } = fixture();
  const results = await Promise.all(Array.from({ length: 10 }, () => service.confirmBooking(command)));
  assert(results.every(item => item.session.id === command.id));
  const ledger = await service.getLedger();
  assert.equal(ledger.sessions.length, 1);
  assert.equal(ledger.movements.length, 1);
  assert.equal(ledger.wallet.available, 15);
  assert.equal(ledger.wallet.held, 5);
  await assert.rejects(service.confirmBooking({ ...command, duration: 60 }), isCode('id_conflict'));
});

test('IDs diferentes que compiten por el mismo horario no duplican reserva ni cargo', async () => {
  const { service, command } = fixture();
  const results = await Promise.allSettled([service.confirmBooking(command), service.confirmBooking({ ...command, id: 'SES-test-2' })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal((await service.getLedger()).movements.length, 1);
});

test('regresión de éxito: el comprobante no cambia si desaparece la oferta o se bloquean sus horarios', async () => {
  const { service, command, catalog, options } = fixture();
  const first = await service.confirmBooking(command);
  catalog[0].slots = {};
  catalog[0].active = false;
  assert.equal(await service.getBookingContext('carlos'), null);
  assert.deepEqual((await service.confirmBooking(command)).session, first.session);
  assert.deepEqual(await createLocalBookingStore(options).getBooking(command.id), first.session);
  assert.equal(first.session.time, '7:00 PM');
  assert.equal(await service.getBooking('inexistente'), null);
});

test('valida saldo insuficiente al confirmar sin modificar el registro', async () => {
  const { service, command } = fixture(0);
  await assert.rejects(service.confirmBooking(command), isCode('insufficient_balance'));
  assert.equal((await service.getLedger()).sessions.length, 0);
  const next = fixture();
  await next.service.confirmBooking({ ...next.command, duration: 90 });
  const otherDate = getNextAvailableDates(next.catalog[0].slots, 8, now())[1];
  await assert.rejects(next.service.confirmBooking({ ...next.command, id: 'SES-test-2', date: otherDate, duration: 60 }), isCode('insufficient_balance'));
  assert.equal((await next.service.getLedger()).wallet.available, 5);
});

test('valida oferta activa, aprobada, habilidad vigente, autorreserva y duraciones publicadas', async () => {
  for (const mutate of [
    (catalog: typeof mentors) => { catalog[0].active = false; },
    (catalog: typeof mentors) => { catalog[0].skillValidated = false; },
    (catalog: typeof mentors) => { catalog[0].offer.skillId = 'marketing'; },
    (catalog: typeof mentors) => { catalog[0].offer.durations = [60]; },
    (catalog: typeof mentors) => { catalog[0].id = 'student-mentor-current'; },
  ]) {
    const { service, command, catalog } = fixture(); mutate(catalog);
    await assert.rejects(service.confirmBooking({ ...command, mentorId: catalog[0].id }), isCode('offer_unavailable'));
    assert.equal((await service.getLedger()).wallet.available, 20);
  }
});

test('rechaza fecha pasada/inválida y rangos sin cobertura suficiente', async () => {
  const { service, command, catalog } = fixture();
  for (const date of ['2020-01-01', '2030-02-30', 'no-date']) await assert.rejects(service.confirmBooking({ ...command, date }), isCode('invalid_date'));
  await assert.rejects(service.confirmBooking({ ...command, time: '8:00 PM', duration: 90 }), isCode('slot_unavailable'));
  await assert.rejects(service.confirmBooking({ ...command, time: '99:99 PM' }), isCode('slot_unavailable'));
  assert.equal(isWithinAvailability(catalog[0].slots, command.date, '7:00 PM', 90), true);
  assert.equal(isWithinAvailability(catalog[0].slots, command.date, '8:00 PM', 90), false);
});

test('evita solapamientos del estudiante con otro mentor y permite intervalos contiguos', async () => {
  const { service, command, catalog } = fixture();
  catalog.push({ ...structuredClone(catalog[0]), id: 'other-mentor' });
  await service.confirmBooking({ ...command, duration: 60 });
  await assert.rejects(service.confirmBooking({ ...command, id: 'SES-test-2', mentorId: 'other-mentor' }), isCode('slot_unavailable'));
  await service.confirmBooking({ ...command, id: 'SES-test-3', mentorId: 'other-mentor', time: '8:00 PM', duration: 60 });
  assert.equal((await service.getLedger()).wallet.available, 0);
  assert.equal((await service.getLedger()).wallet.held, 20);
});

test('un fallo de escritura no guarda sesión ni retención; reintentar con el mismo ID es seguro', async () => {
  const { service, command, storage } = fixture();
  storage.fail = true;
  await assert.rejects(service.confirmBooking(command), isCode('storage_failed'));
  assert.equal(storage.values.size, 0);
  assert.equal((await service.getLedger()).wallet.available, 20);
  storage.fail = false;
  await service.confirmBooking(command);
  assert.equal((await service.getLedger()).sessions.length, 1);
});

test('los datos corruptos no reinician el saldo y el borrador conserva un ID estable al recargar', async () => {
  const { service, command, storage, options } = fixture();
  await service.saveBookingDraft({ ...command, step: 'confirm' });
  assert.deepEqual(await createLocalBookingStore(options).getBookingDraft(), { ...command, step: 'confirm' });
  await service.clearBookingDraft();
  assert.equal(await service.getBookingDraft(), null);
  storage.setItem(bookingStorageKey, '{broken');
  await assert.rejects(service.getLedger(), isCode('storage_invalid'));
  await assert.rejects(service.confirmBooking(command), isCode('storage_invalid'));
  assert.equal(storage.getItem(bookingStorageKey), '{broken');
});

test('el nombre actualizado se usa en nuevas reservas y conserva el comprobante histórico al reintentar', async () => {
  const { service, command } = fixture();
  const first = await service.confirmBooking(command, 'Ana Díaz');
  assert.equal(first.session.learnerName, 'Ana Díaz');
  assert.equal((await service.getBookingContext('carlos', 'Ana Actualizada'))?.userName, 'Ana Actualizada');
  assert.equal((await service.confirmBooking(command, 'Ana Actualizada')).session.learnerName, 'Ana Díaz');
});
