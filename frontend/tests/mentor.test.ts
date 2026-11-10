import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalBookingStore, bookingStorageKey } from '../src/dev/bookingStore';
import { mentors } from '../src/dev/mentorFixtures';
import { BookingError, type BookingCommand } from '../src/data/booking';
import { defaultOffer, publishedMentors, reservedAvailabilityBlock, type MentorSessionAction } from '../src/data/mentor';
import type { AccountData, MentorSkillRequest } from '../src/data/account';
import { getNextAvailableDates } from '../src/data/scheduling';
import { isEligibleMentor } from '../src/data/recommendations';

class MemoryStorage {
  values = new Map<string, string>(); fail = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw new Error('quota'); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
async function fixture(approved = true) {
  const storage = new MemoryStorage(); let clock = new Date('2030-04-01T12:00:00-05:00');
  const request: MentorSkillRequest = { id: 'REQ-python', ownerUserId: 'current', userName: 'Alex', skill: 'Python', level: 'Intermedio', experience: 'Experiencia Python', topics: 'Variables, funciones', portfolio: '', evidenceName: 'doc.pdf', evidenceStorageId: 'evidence-fixture', requestedAt: clock.toISOString(), status: approved ? 'approved' : 'pending', history: [], submissionId: 'SUB-1', submissionSignature: 'signature' };
  const account: AccountData = { version: 1, userId: 'current', profile: {}, requests: [request], notifications: [] };
  const opening = { available: 20, held: 0, used: 0, earned: 0 };
  const options = { storage: () => storage, routeStorage: () => storage, identity: { id: 'current', name: 'Alex' }, initialWallet: opening,
    participants: { elena: { name: 'Elena', initialWallet: opening }, diego: { name: 'Diego', initialWallet: opening } }, now: () => clock,
    getApprovedRequests: async () => account.requests,
    getMentors: (ledger: Parameters<typeof publishedMentors>[1]) => [...structuredClone(mentors), ...publishedMentors(account, ledger, { name: 'Alex', bio: '' })],
  };
  const service = createLocalBookingStore(options); const slots = { Martes: ['7:00 PM', '8:00 PM'], Jueves: ['7:00 PM', '8:00 PM'] };
  const command: BookingCommand = { id: 'SES-incoming', mentorId: 'student-mentor-current:REQ-python', date: getNextAvailableDates(slots, 8, clock)[0], time: '7:00 PM', duration: 30 };
  const publish = async () => { await service.saveMentorAvailability(slots); await service.saveMentorOffer(request.id, { ...defaultOffer(request), active: true }); };
  return { service, options, account, request, storage, slots, command, publish, setTime: (time: number) => { clock = new Date(time); } };
}
const code = (value: string) => (error: unknown) => error instanceof BookingError && error.code === value;

test('mentor: requiere aprobación vigente, propia y no permite acciones estudiantiles', async () => {
  const f = await fixture(false);
  await assert.rejects(f.publish(), code('mentor_unavailable'));
  f.request.status = 'approved'; await f.publish();
  await assert.rejects(f.service.saveMentorOffer('foreign', defaultOffer(f.request)), code('invalid_offer'));
  await assert.rejects(f.service.updateMentorSession({ type: 'validate', sessionId: 'SES-incoming' } as unknown as MentorSessionAction), code('invalid_request'));
  f.request.status = 'pending'; await assert.rejects(f.service.saveMentorAvailability(f.slots), code('mentor_unavailable'));
});
test('ofertas: sin publicar, pausadas o sin horarios no aceptan reservas; costos permanecen 5/10/15', async () => {
  const f = await fixture();
  await assert.rejects(f.service.reserveFixtureStudent(f.command, 'elena'), code('offer_unavailable'));
  await f.service.saveMentorOffer(f.request.id, { ...defaultOffer(f.request), active: true });
  await assert.rejects(f.service.reserveFixtureStudent(f.command, 'elena'), code('offer_unavailable'));
  await f.service.saveMentorAvailability(f.slots);
  for (const duration of [30, 60, 90] as const) {
    const next = await f.service.reserveFixtureStudent({ ...f.command, id: `SES-${duration}`, duration }, 'elena');
    assert.equal(next.session.credits, duration / 6);
    await f.service.updateFixtureStudent({ type: 'cancel', sessionId: next.session.id }, 'elena');
  }
  await f.service.saveMentorOffer(f.request.id, { ...defaultOffer(f.request), active: false });
  await assert.rejects(f.service.reserveFixtureStudent({ ...f.command, id: 'SES-paused' }, 'elena'), code('offer_unavailable'));
  for (const patch of [{ topic: '' }, { description: '' }, { durations: [] }, { durations: [15] }, { level: 'Otro' }]) await assert.rejects(f.service.saveMentorOffer(f.request.id, { ...defaultOffer(f.request), ...patch } as ReturnType<typeof defaultOffer>), code('invalid_offer'));
  await assert.rejects(f.service.saveMentorAvailability({ Otro: ['7:00 PM'] }), code('invalid_availability'));
});
test('autorreserva rechazada para cada oferta; ofertas diferentes de la misma persona comparten solapamientos', async () => {
  const f = await fixture(); const second = { ...f.request, id: 'REQ-react', skill: 'React' }; f.account.requests.push(second); await f.publish();
  await f.service.saveMentorOffer(second.id, { ...defaultOffer(second), active: true });
  const catalog = await f.service.getMentorCatalog(); assert.equal(new Set(catalog.map(item => item.id)).size, catalog.length);
  for (const mentor of catalog.filter(item => item.ownerUserId === 'current')) {
    assert.equal(isEligibleMentor(mentor, 'current'), false);
    await assert.rejects(f.service.confirmBooking({ ...f.command, mentorId: mentor.id }), code('offer_unavailable'));
  }
  await f.service.reserveFixtureStudent({ ...f.command, duration: 60 }, 'elena');
  const other = { ...f.command, id: 'SES-other', mentorId: 'student-mentor-current:REQ-react', duration: 60 as const };
  await assert.rejects(f.service.reserveFixtureStudent(other, 'diego'), code('slot_unavailable'));
  await f.service.reserveFixtureStudent({ ...other, time: '8:00 PM' }, 'diego');
  assert.equal((await f.service.getLedger()).sessions.length, 2);
});
test('evita que la misma persona enseñe y aprenda en intervalos superpuestos', async () => {
  const f = await fixture(); await f.publish();
  await f.service.confirmBooking({ ...f.command, id: 'SES-learning', mentorId: 'carlos', duration: 60 });
  await assert.rejects(f.service.reserveFixtureStudent(f.command, 'elena'), code('slot_unavailable'));
  await f.service.reserveFixtureStudent({ ...f.command, time: '8:00 PM' }, 'elena');
  await assert.rejects(f.service.confirmBooking({ ...f.command, id: 'SES-learning-2', mentorId: 'carlos', time: '8:00 PM' }), code('slot_unavailable'));
});
test('disponibilidad protege la cobertura completa de 90 min; cancelación permite retirar el bloque', async () => {
  const f = await fixture(); await f.publish();
  await f.service.reserveFixtureStudent({ ...f.command, duration: 90 }, 'elena');
  const ledger = await f.service.getLedger(); const settings = ledger.mentorSettings!.current;
  assert.equal(reservedAvailabilityBlock('Martes', '8:00 PM', settings, ledger.sessions, 'current', f.options.now()), true);
  await assert.rejects(f.service.saveMentorAvailability({ Martes: ['7:00 PM'] }), code('reserved_availability'));
  await f.service.updateFixtureStudent({ type: 'cancel', sessionId: f.command.id }, 'elena');
  await f.service.saveMentorAvailability({ Martes: ['7:00 PM'] });
  assert.equal((await f.service.getLedger()).wallets!.elena.available, 20);
});
test('mentor → estudiante: dos fechas, liberación única y ganancias en la misma billetera', async () => {
  const f = await fixture(); await f.publish(); await f.service.reserveFixtureStudent(f.command, 'elena');
  await assert.rejects(f.service.updateSession({ type: 'validate', sessionId: f.command.id }), code('invalid_transition'));
  await f.service.updateMentorSession({ type: 'start', sessionId: f.command.id });
  await Promise.all(Array.from({ length: 6 }, () => f.service.updateMentorSession({ type: 'perform', sessionId: f.command.id })));
  const held = await f.service.getLedger(); assert.equal(held.wallet.earned, 0); assert.equal(held.wallets!.elena.held, 5); assert.equal(held.sessions[0].validatedAt, undefined);
  f.setTime(Date.parse(held.sessions[0].performedAt!) + 60_000);
  await Promise.all(Array.from({ length: 10 }, () => f.service.updateFixtureStudent({ type: 'validate', sessionId: f.command.id }, 'elena')));
  const ledger = await createLocalBookingStore(f.options).getLedger();
  assert.deepEqual(ledger.wallet, { available: 25, held: 0, used: 0, earned: 5 });
  assert.deepEqual(ledger.wallets!.elena, { available: 15, held: 0, used: 5, earned: 0 });
  assert.notEqual(ledger.sessions[0].performedAt, ledger.sessions[0].validatedAt);
  assert.equal(ledger.movements.filter(item => item.type === 'earning' && item.userId === 'current').length, 1);
  await assert.rejects(f.service.updateMentorSession({ type: 'report', sessionId: f.command.id, category: 'other', reason: 'Después de completar' }), code('invalid_transition'));
});
test('oferta pausada conserva reservas; discrepancia retiene y valoración solo después de completar', async () => {
  const f = await fixture(); await f.publish(); await f.service.reserveFixtureStudent(f.command, 'elena');
  await f.service.saveMentorOffer(f.request.id, { ...defaultOffer(f.request), active: false });
  await f.service.updateMentorSession({ type: 'start', sessionId: f.command.id });
  await f.service.updateMentorSession({ type: 'report', sessionId: f.command.id, category: 'student_absent', reason: 'El estudiante no pudo asistir' });
  await assert.rejects(f.service.updateFixtureStudent({ type: 'validate', sessionId: f.command.id }, 'elena'), code('invalid_transition'));
  assert.equal((await f.service.getLedger()).wallets!.elena.held, 5); assert.equal((await f.service.getLedger()).wallet.earned, 0);
  const next = await fixture(); await next.publish(); await next.service.reserveFixtureStudent(next.command, 'elena');
  await next.service.updateMentorSession({ type: 'start', sessionId: next.command.id }); await next.service.updateMentorSession({ type: 'perform', sessionId: next.command.id });
  await next.service.updateFixtureStudent({ type: 'validate', sessionId: next.command.id }, 'elena');
  await next.service.updateFixtureStudent({ type: 'rate', sessionId: next.command.id, rating: 5, comment: 'Excelente' }, 'elena');
  await assert.rejects(next.service.updateFixtureStudent({ type: 'rate', sessionId: next.command.id, rating: 4, comment: '' }, 'elena'), code('invalid_transition'));
  assert.equal((await createLocalBookingStore(next.options).getLedger()).reviews[0].comment, 'Excelente');
});
test('fallos de guardado no alteran oferta, disponibilidad, confirmaciones ni transferencias', async () => {
  const f = await fixture(); await f.publish(); await f.service.reserveFixtureStudent(f.command, 'elena');
  for (const run of [() => f.service.saveMentorAvailability({ ...f.slots, Viernes: ['7:00 PM'] }), () => f.service.saveMentorOffer(f.request.id, { ...defaultOffer(f.request), active: false }), () => f.service.updateMentorSession({ type: 'start', sessionId: f.command.id })]) {
    const before = f.storage.getItem(bookingStorageKey); f.storage.fail = true; await assert.rejects(run(), code('storage_failed')); assert.equal(f.storage.getItem(bookingStorageKey), before); f.storage.fail = false;
  }
  await f.service.updateMentorSession({ type: 'start', sessionId: f.command.id });
  f.storage.fail = true; await assert.rejects(f.service.updateMentorSession({ type: 'perform', sessionId: f.command.id }), code('storage_failed')); f.storage.fail = false;
  await f.service.updateMentorSession({ type: 'perform', sessionId: f.command.id }); const before = f.storage.getItem(bookingStorageKey);
  f.storage.fail = true; await assert.rejects(f.service.updateFixtureStudent({ type: 'validate', sessionId: f.command.id }, 'elena'), code('storage_failed')); assert.equal(f.storage.getItem(bookingStorageKey), before); f.storage.fail = false;
  await f.service.updateFixtureStudent({ type: 'validate', sessionId: f.command.id }, 'elena'); assert.equal((await f.service.getLedger()).wallet.earned, 5);
});
test('lectura v1 conserva las reservas previas y detecta manipulación de ganancias o billeteras', async () => {
  const f = await fixture(); await f.service.confirmBooking({ ...f.command, mentorId: 'carlos' });
  const old = JSON.parse(f.storage.getItem(bookingStorageKey)!); delete old.wallets; delete old.mentorSettings;
  f.storage.setItem(bookingStorageKey, JSON.stringify(old)); const migrated = await f.service.getLedger();
  assert.equal(migrated.wallet.available, 15); assert.equal(migrated.sessions.length, 1); assert.equal(migrated.wallets!.elena.available, 20);
  for (const mutate of [(item: typeof old) => item.wallet.earned++, (item: typeof old) => { item.wallets.elena.available++; }]) {
    const broken = structuredClone(migrated); mutate(broken); f.storage.setItem(bookingStorageKey, JSON.stringify(broken)); await assert.rejects(f.service.getLedger(), code('storage_invalid'));
  }
});
