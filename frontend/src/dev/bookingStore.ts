import { BookingError, type BookingCommand, type BookingDraft, type BookingLedger, type BookingResult } from '../data/booking';
import type { Mentor } from '../data/mentors';
import type { WalletBalance } from '../data/student';
import { academicSessionCost } from '../data/creditConfig';
import { isEligibleMentor } from '../data/recommendations';
import { formatSessionSchedule, formatSessionTime, getNextAvailableDates, intervalSlotKeys, intervalsOverlap, isSlotAvailable, parseTime } from '../data/scheduling';
import { transitionSession, type SessionAction, type MentorFixtureAction } from '../data/sessionLifecycle';
import { validateLedger } from './ledgerValidation';
import { availabilityPreservesBookings, defaultMentorSettings, mentorOwnerId, normalizeAvailability, normalizeOffer, sessionMentorOwner, type MentorSessionAction, type OfferSettings } from '../data/mentor';
import type { MentorSkillRequest } from '../data/account';
import type { WeeklyAvailability } from '../data/scheduling';
import { ACTIVE_SKILLS } from '../data/skillCatalog';
import { transitionAdmin } from '../data/adminLifecycle';
import type { AdminActivityAction } from '../data/admin';
import { notifyCatalogChanged } from '../services/catalog';

export const bookingStorageKey = 'skillswap:frontend-demo:bookings:v1';
export const bookingDraftKey = 'skillswap:frontend-demo:booking-route:v1';
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Adaptación de reserveSession de sessionLifecycle.ts: una sola escritura para toda la reserva. */
export function createLocalBookingStore({ storage, routeStorage, getMentors, identity, initialWallet, now = () => new Date(), participants = {}, getApprovedRequests = async () => [] }: {
  storage: () => StoragePort; routeStorage: () => StoragePort; getMentors: (ledger: BookingLedger) => Mentor[] | Promise<Mentor[]>;
  identity: { id: string; name: string }; initialWallet: WalletBalance; now?: () => Date;
  participants?: Record<string, { name: string; initialWallet: WalletBalance }>;
  getApprovedRequests?: () => Promise<MentorSkillRequest[]>;
}) {
  let queue: Promise<unknown> = Promise.resolve();
  const participantInitials = Object.fromEntries(Object.entries(participants).map(([id, item]) => [id, { ...item.initialWallet }]));
  const invalidStorage = () => new BookingError('storage_invalid', 'No pudimos leer las reservas guardadas. No se modificó tu saldo.');
  const requireActive = (ledger: BookingLedger, userId: string) => { if (ledger.suspendedUserIds?.includes(userId)) throw new BookingError('account_suspended', 'Esta cuenta está suspendida. Contacta a administración.'); };
  const read = (): BookingLedger => {
    let raw: string | null;
    try { raw = storage().getItem(bookingStorageKey); } catch { throw invalidStorage(); }
    if (raw === null) return { version: 1, studentId: identity.id, wallet: { ...initialWallet }, sessions: [], movements: [], notifications: [], incidents: [], reviews: [], mentorBalances: {}, wallets: structuredClone(participantInitials), mentorSettings: {} };
    try {
      return validateLedger(JSON.parse(raw) as BookingLedger, identity.id, initialWallet, participantInitials);
    } catch { throw invalidStorage(); }
  };
  const result = (ledger: BookingLedger, id: string): BookingResult => {
    const session = ledger.sessions.find(item => item.id === id)!;
    return structuredClone({ session, wallet: ledger.wallet, notifications: ledger.notifications.filter(item => item.id === `NOT-${id}-booked-student`), ledger });
  };
  const commit = async (command: BookingCommand, learnerName: string, studentId = identity.id): Promise<BookingResult> => {
    const ledger = read();
    requireActive(ledger, studentId);
    const wallet = studentId === identity.id ? ledger.wallet : ledger.wallets?.[studentId];
    if (!wallet) throw new BookingError('invalid_request', 'No encontramos la billetera del estudiante.');
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(command.id) || ![30, 60, 90].includes(command.duration)) throw new BookingError('invalid_request', 'La reserva no es válida. Revisa la selección.');
    const existing = ledger.sessions.find(item => item.id === command.id);
    if (existing) {
      if (existing.studentId !== studentId || existing.mentorId !== command.mentorId || existing.date !== command.date || existing.time !== formatSessionTime(command.time) || existing.duration !== command.duration) throw new BookingError('id_conflict', 'Este identificador corresponde a otra reserva. Vuelve a iniciar el proceso.');
      return result(ledger, existing.id); // Reintento: el comprobante original prevalece sobre la disponibilidad actual.
    }
    const mentor = (await getMentors(ledger)).find(item => item.id === command.mentorId);
    if (!mentor || !isEligibleMentor(mentor, studentId) || !mentor.offer.durations.includes(command.duration)) throw new BookingError('offer_unavailable', 'Esta oferta no está disponible para reservar.');
    if (!getNextAvailableDates(mentor.slots, 8, now()).includes(command.date)) throw new BookingError('invalid_date', 'Selecciona una fecha disponible y futura.');
    const time = formatSessionTime(command.time);
    const reservedSlots = ledger.sessions.filter(item => item.status !== 'cancelled').flatMap(item => item.reservedSlotKeys);
    const available = isSlotAvailable({ mentorId: mentor.id, date: command.date, time, duration: command.duration, availability: mentor.slots, sessions: ledger.sessions, reservedSlots });
    const start = parseTime(time);
    const owner = mentor.ownerUserId ?? mentorOwnerId(mentor.id);
    requireActive(ledger, owner);
    const studentOverlap = ledger.sessions.some(item => item.status !== 'cancelled' && item.date === command.date
      && (item.studentId === studentId || sessionMentorOwner(item) === studentId || item.studentId === owner || sessionMentorOwner(item) === owner)
      && intervalsOverlap(start, start + command.duration, parseTime(item.time), parseTime(item.time) + item.duration));
    if (!available || studentOverlap) throw new BookingError('slot_unavailable', 'Este horario ya no está disponible o coincide con otra de tus sesiones. Selecciona otro.');
    const credits = academicSessionCost(command.duration);
    if (wallet.available < credits) throw new BookingError('insufficient_balance', 'No tienes suficientes créditos para esta sesión.');
    const createdAt = now().toISOString();
    const session = {
      id: command.id, studentId, learnerName, mentorId: mentor.id, mentorName: mentor.name,
      ...(mentor.ownerUserId ? { mentorOwnerId: mentor.ownerUserId, offerRequestId: mentor.requestId } : {}),
      skill: mentor.skill, topic: mentor.offer.topic, date: command.date, time, duration: command.duration, credits,
      status: 'upcoming' as const, meetingPlatform: null, meetingUrl: null, createdAt,
      reservedSlotKeys: intervalSlotKeys(mentor.id, command.date, time, command.duration),
    };
    const next: BookingLedger = {
      ...ledger, wallet: studentId === identity.id ? { ...wallet, available: wallet.available - credits, held: wallet.held + credits } : ledger.wallet,
      wallets: studentId === identity.id ? ledger.wallets : { ...ledger.wallets, [studentId]: { ...wallet, available: wallet.available - credits, held: wallet.held + credits } },
      sessions: [session, ...ledger.sessions],
      movements: [{ id: `MOV-${session.id}-hold`, reference: `${session.id}:hold`, sessionId: session.id, type: 'hold', amount: -credits, status: 'pending', createdAt, userId: studentId }, ...ledger.movements],
      notifications: [{ id: `NOT-${session.id}-booked-student`, userId: studentId, title: 'Reserva confirmada', description: `${session.skill} con ${session.mentorName} · ${formatSessionSchedule(session.date, session.time)}`, date: 'Ahora', read: false, target: 'sessions', sessionId: session.id },
        ...(mentor.ownerUserId ? [{ id: `NOT-${session.id}-booked-mentor`, userId: mentor.ownerUserId, title: 'Nueva reserva', description: `${learnerName} reservó una sesión de ${session.skill}.`, date: 'Ahora', read: false, target: 'mentor-sessions', sessionId: session.id }] : []), ...ledger.notifications],
    };
    validateLedger(next, identity.id, initialWallet, participantInitials);
    try { storage().setItem(bookingStorageKey, JSON.stringify(next)); }
    catch { throw new BookingError('storage_failed', 'No pudimos guardar la reserva. No se retuvieron créditos. Vuelve a intentarlo.'); }
    notifyCatalogChanged();
    return result(next, session.id);
  };
  const validDraft = (value: unknown): value is BookingDraft => {
    if (!value || typeof value !== 'object') return false;
    const draft = value as BookingDraft;
    return typeof draft.id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(draft.id) && typeof draft.mentorId === 'string' && typeof draft.date === 'string' && typeof draft.time === 'string' && [30, 60, 90].includes(draft.duration) && ['schedule', 'duration', 'confirm', 'success'].includes(draft.step);
  };
  const serialized = <T,>(execute: () => T | Promise<T>): Promise<T> => {
    const pending = queue.then(() => typeof window !== 'undefined' && window.navigator.locks ? window.navigator.locks.request(bookingStorageKey, execute) : execute());
    queue = pending.catch(() => undefined);
    return pending;
  };
  const apply = (action: SessionAction | MentorFixtureAction | MentorSessionAction, actor = { role: 'student' as 'student' | 'mentor', id: identity.id }) => serialized(() => {
    const previous = read();
    requireActive(previous, actor.id);
    const next = transitionSession(previous, action, now(), actor);
    validateLedger(next, identity.id, initialWallet, participantInitials);
    if (next !== previous) {
      try { storage().setItem(bookingStorageKey, JSON.stringify(next)); }
      catch { throw new BookingError('storage_failed', 'No pudimos guardar el cambio. La sesión y los créditos siguen sin modificaciones. Vuelve a intentarlo.'); }
      notifyCatalogChanged();
    }
    return structuredClone(next);
  });
  const requireApproval = async () => {
    requireActive(read(), identity.id);
    const approved = (await getApprovedRequests()).filter(item => item.ownerUserId === identity.id && item.status === 'approved');
    if (!approved.length) throw new BookingError('mentor_unavailable', 'Necesitas una habilidad aprobada para acceder a la vista de mentor.');
    return approved;
  };
  const persistSettings = (ledger: BookingLedger) => {
    validateLedger(ledger, identity.id, initialWallet, participantInitials);
    try { storage().setItem(bookingStorageKey, JSON.stringify(ledger)); }
    catch { throw new BookingError('storage_failed', 'No pudimos guardar los cambios. Se conservó la configuración anterior. Inténtalo nuevamente.'); }
    notifyCatalogChanged();
    return structuredClone(ledger);
  };
  return {
    async updateAdmin(command: AdminActivityAction, knownUsers: string[]) {
      return serialized(() => {
        const previous = read(); const next = transitionAdmin(previous, command, knownUsers, now());
        return next === previous ? structuredClone(previous) : persistSettings(next);
      });
    },
    async saveMentorAvailability(draft: WeeklyAvailability) {
      return serialized(async () => {
        await requireApproval(); const ledger = read(); const availability = normalizeAvailability(draft);
        if (!availabilityPreservesBookings(availability, ledger.sessions, identity.id, now())) throw new BookingError('reserved_availability', 'No puedes quitar bloques que cubren reservas vigentes. Se conservó la disponibilidad anterior.');
        const settings = ledger.mentorSettings?.[identity.id] ?? defaultMentorSettings();
        ledger.mentorSettings = { ...ledger.mentorSettings, [identity.id]: { ...settings, availability } }; return persistSettings(ledger);
      });
    },
    async saveMentorOffer(requestId: string, draft: OfferSettings) {
      return serialized(async () => {
        const approved = await requireApproval(); const request = approved.find(item => item.id === requestId);
        if (!request || !ACTIVE_SKILLS.some(item => item.name === request.skill)) throw new BookingError('invalid_offer', 'Solo puedes publicar habilidades aprobadas y vigentes.');
        const offer = normalizeOffer(draft); const ledger = read(); const settings = ledger.mentorSettings?.[identity.id] ?? defaultMentorSettings();
        ledger.mentorSettings = { ...ledger.mentorSettings, [identity.id]: { ...settings, offers: { ...settings.offers, [requestId]: offer } } }; return persistSettings(ledger);
      });
    },
    async updateMentorSession(action: MentorSessionAction) {
      if ('mentorId' in action || !['start', 'perform', 'report', 'meeting'].includes(action.type)) throw new BookingError('invalid_request', 'Esta acción no está disponible para el mentor.');
      await requireApproval(); return apply(action, { role: 'mentor', id: identity.id });
    },
    async updateSession(action: SessionAction) {
      if ('mentorId' in action || !['cancel', 'validate', 'report', 'rate'].includes(action.type)) throw new BookingError('invalid_request', 'Esta acción no está disponible para el estudiante.');
      return apply(action);
    },
    // Solo fixtures del frontend: no se expone en el contrato StudentService ni en la interfaz estudiantil.
    async applyMentorFixture(action: MentorFixtureAction) { return apply(action, { role: 'mentor', id: mentorOwnerId(action.mentorId) }); },
    async reserveFixtureStudent(command: BookingCommand, studentId: string) {
      const participant = participants[studentId];
      if (!participant) throw new BookingError('invalid_request', 'Estudiante de prueba no disponible.');
      return serialized(() => commit(command, participant.name, studentId));
    },
    async updateFixtureStudent(action: SessionAction, studentId: string) {
      if (!participants[studentId] || 'mentorId' in action || !['cancel', 'validate', 'report', 'rate'].includes(action.type)) throw new BookingError('invalid_request', 'Acción de prueba no disponible.');
      return apply(action, { role: 'student', id: studentId });
    },
    async getLedger() { return structuredClone(read()); },
    async getMentorCatalog() { return getMentors(read()); },
    async getBookingContext(mentorId: string, userName = identity.name) {
      const ledger = read();
      const mentor = (await getMentors(ledger)).find(item => item.id === mentorId);
      if (!mentor || !isEligibleMentor(mentor, identity.id)) return null;
      return structuredClone({ mentor, studentId: identity.id, userName, wallet: ledger.wallet, sessions: ledger.sessions, reservedSlots: ledger.sessions.filter(item => item.status !== 'cancelled').flatMap(item => item.reservedSlotKeys) });
    },
    async confirmBooking(command: BookingCommand, learnerName = identity.name) {
      return serialized(() => commit(command, learnerName));
    },
    async getBooking(id: string) { return structuredClone(read().sessions.find(item => item.id === id && item.studentId === identity.id) ?? null); },
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
