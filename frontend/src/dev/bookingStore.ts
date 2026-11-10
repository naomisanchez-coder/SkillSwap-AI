import { BookingError, type BookingCommand, type BookingDraft, type BookingLedger, type BookingResult } from '../data/booking';
import type { Mentor } from '../data/mentors';
import type { WalletBalance } from '../data/student';
import { academicSessionCost } from '../data/creditConfig';
import { isEligibleMentor } from '../data/recommendations';
import { dayNameFromISO, formatSessionSchedule, formatSessionTime, getNextAvailableDates, intervalSlotKeys, intervalsOverlap, isSlotAvailable, parseTime } from '../data/scheduling';

export const bookingStorageKey = 'skillswap:frontend-demo:bookings:v1';
export const bookingDraftKey = 'skillswap:frontend-demo:booking-route:v1';
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Adaptación de reserveSession de sessionLifecycle.ts: una sola escritura para toda la reserva. */
export function createLocalBookingStore({ storage, routeStorage, getMentors, identity, initialWallet, now = () => new Date() }: {
  storage: () => StoragePort; routeStorage: () => StoragePort; getMentors: () => Mentor[];
  identity: { id: string; name: string }; initialWallet: WalletBalance; now?: () => Date;
}) {
  let queue: Promise<unknown> = Promise.resolve();
  const invalidStorage = () => new BookingError('storage_invalid', 'No pudimos leer las reservas guardadas. No se modificó tu saldo.');
  const read = (): BookingLedger => {
    let raw: string | null;
    try { raw = storage().getItem(bookingStorageKey); } catch { throw invalidStorage(); }
    if (raw === null) return { version: 1, studentId: identity.id, wallet: { ...initialWallet }, sessions: [], movements: [], notifications: [] };
    try {
      const value = JSON.parse(raw) as BookingLedger;
      if (value.version !== 1 || value.studentId !== identity.id || !value.wallet || !['available', 'held', 'used', 'earned'].every(key => Number.isSafeInteger(value.wallet[key as keyof WalletBalance]) && value.wallet[key as keyof WalletBalance] >= 0)
        || !Array.isArray(value.sessions) || !Array.isArray(value.movements) || !Array.isArray(value.notifications)) throw invalidStorage();
      const ids = new Set<string>();
      for (const session of value.sessions) {
        if (!session || typeof session.id !== 'string' || ids.has(session.id) || session.studentId !== identity.id || ![30, 60, 90].includes(session.duration)
          || session.credits !== academicSessionCost(session.duration) || !dayNameFromISO(session.date) || !Number.isFinite(parseTime(session.time)) || session.status !== 'upcoming'
          || typeof session.mentorId !== 'string' || typeof session.mentorName !== 'string' || !Array.isArray(session.reservedSlotKeys)
          || JSON.stringify(session.reservedSlotKeys) !== JSON.stringify(intervalSlotKeys(session.mentorId, session.date, session.time, session.duration))) throw invalidStorage();
        ids.add(session.id);
      }
      if (value.movements.length !== value.sessions.length || value.sessions.some(session => value.movements.filter(item => item.reference === `${session.id}:hold` && item.sessionId === session.id && item.amount === -session.credits && item.type === 'hold' && item.status === 'pending').length !== 1)) throw invalidStorage();
      const held = value.sessions.reduce((total, session) => total + session.credits, 0);
      if (value.wallet.available !== initialWallet.available - held || value.wallet.held !== initialWallet.held + held || value.wallet.used !== initialWallet.used || value.wallet.earned !== initialWallet.earned) throw invalidStorage();
      if (value.notifications.length !== value.sessions.length || value.sessions.some(session => !value.notifications.some(item => item.id === `NOT-${session.id}-booked-student` && item.userId === identity.id && item.target === 'sessions'))) throw invalidStorage();
      return value;
    } catch { throw invalidStorage(); }
  };
  const result = (ledger: BookingLedger, id: string): BookingResult => {
    const session = ledger.sessions.find(item => item.id === id)!;
    return structuredClone({ session, wallet: ledger.wallet, notifications: ledger.notifications.filter(item => item.id === `NOT-${id}-booked-student`) });
  };
  const commit = (command: BookingCommand): BookingResult => {
    const ledger = read();
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(command.id) || ![30, 60, 90].includes(command.duration)) throw new BookingError('invalid_request', 'La reserva no es válida. Revisa la selección.');
    const existing = ledger.sessions.find(item => item.id === command.id);
    if (existing) {
      if (existing.mentorId !== command.mentorId || existing.date !== command.date || existing.time !== formatSessionTime(command.time) || existing.duration !== command.duration) throw new BookingError('id_conflict', 'Este identificador corresponde a otra reserva. Vuelve a iniciar el proceso.');
      return result(ledger, existing.id); // Reintento: el comprobante original prevalece sobre la disponibilidad actual.
    }
    const mentor = getMentors().find(item => item.id === command.mentorId);
    if (!mentor || !isEligibleMentor(mentor, identity.id) || !mentor.offer.durations.includes(command.duration)) throw new BookingError('offer_unavailable', 'Esta oferta no está disponible para reservar.');
    if (!getNextAvailableDates(mentor.slots, 8, now()).includes(command.date)) throw new BookingError('invalid_date', 'Selecciona una fecha disponible y futura.');
    const time = formatSessionTime(command.time);
    const reservedSlots = ledger.sessions.flatMap(item => item.reservedSlotKeys);
    const available = isSlotAvailable({ mentorId: mentor.id, date: command.date, time, duration: command.duration, availability: mentor.slots, sessions: ledger.sessions, reservedSlots });
    const start = parseTime(time);
    const studentOverlap = ledger.sessions.some(item => item.date === command.date && intervalsOverlap(start, start + command.duration, parseTime(item.time), parseTime(item.time) + item.duration));
    if (!available || studentOverlap) throw new BookingError('slot_unavailable', 'Este horario ya no está disponible o coincide con otra de tus sesiones. Selecciona otro.');
    const credits = academicSessionCost(command.duration);
    if (ledger.wallet.available < credits) throw new BookingError('insufficient_balance', 'No tienes suficientes créditos para esta sesión.');
    const createdAt = now().toISOString();
    const session = {
      id: command.id, studentId: identity.id, learnerName: identity.name, mentorId: mentor.id, mentorName: mentor.name,
      skill: mentor.skill, topic: mentor.offer.topic, date: command.date, time, duration: command.duration, credits,
      status: 'upcoming' as const, meetingPlatform: null, meetingUrl: null, createdAt,
      reservedSlotKeys: intervalSlotKeys(mentor.id, command.date, time, command.duration),
    };
    const next: BookingLedger = {
      ...ledger, wallet: { ...ledger.wallet, available: ledger.wallet.available - credits, held: ledger.wallet.held + credits },
      sessions: [session, ...ledger.sessions],
      movements: [{ id: `MOV-${session.id}-hold`, reference: `${session.id}:hold`, sessionId: session.id, type: 'hold', amount: -credits, status: 'pending', createdAt }, ...ledger.movements],
      notifications: [{ id: `NOT-${session.id}-booked-student`, userId: identity.id, title: 'Reserva confirmada', description: `${session.skill} con ${session.mentorName} · ${formatSessionSchedule(session.date, session.time)}`, date: 'Ahora', read: false, target: 'sessions' }, ...ledger.notifications],
    };
    try { storage().setItem(bookingStorageKey, JSON.stringify(next)); }
    catch { throw new BookingError('storage_failed', 'No pudimos guardar la reserva. No se retuvieron créditos. Vuelve a intentarlo.'); }
    return result(next, session.id);
  };
  const validDraft = (value: unknown): value is BookingDraft => {
    if (!value || typeof value !== 'object') return false;
    const draft = value as BookingDraft;
    return typeof draft.id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(draft.id) && typeof draft.mentorId === 'string' && typeof draft.date === 'string' && typeof draft.time === 'string' && [30, 60, 90].includes(draft.duration) && ['schedule', 'duration', 'confirm', 'success'].includes(draft.step);
  };
  return {
    async getLedger() { return structuredClone(read()); },
    async getBookingContext(mentorId: string) {
      const mentor = getMentors().find(item => item.id === mentorId);
      if (!mentor || !isEligibleMentor(mentor, identity.id)) return null;
      const ledger = read();
      return structuredClone({ mentor, studentId: identity.id, userName: identity.name, wallet: ledger.wallet, sessions: ledger.sessions, reservedSlots: ledger.sessions.flatMap(item => item.reservedSlotKeys) });
    },
    async confirmBooking(command: BookingCommand) {
      const execute = () => commit(command);
      const pending = queue.then(() => typeof window !== 'undefined' && window.navigator.locks ? window.navigator.locks.request(bookingStorageKey, execute) : execute());
      queue = pending.catch(() => undefined);
      return pending;
    },
    async getBooking(id: string) { return structuredClone(read().sessions.find(item => item.id === id) ?? null); },
    async getBookingDraft() {
      try { const raw = routeStorage().getItem(bookingDraftKey); const value: unknown = raw ? JSON.parse(raw) : null; return validDraft(value) ? value : null; }
      catch { return null; }
    },
    async saveBookingDraft(draft: BookingDraft) {
      if (!validDraft(draft)) return;
      try { routeStorage().setItem(bookingDraftKey, JSON.stringify(draft)); } catch { /* El comprobante sigue persistido aunque no se pueda recordar la navegación. */ }
    },
    async clearBookingDraft() { try { routeStorage().removeItem(bookingDraftKey); } catch { /* No modifica las reservas ni el saldo. */ } },
  };
}
