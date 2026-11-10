import { BookingError, type BookingLedger, type ConfirmedBooking, type IncidentCategory } from './booking';
import { dayNameFromISO, parseTime } from './scheduling';
import { ACADEMIC_CREDIT_CONFIG } from './creditConfig';

// Regla referencial de Figma, pendiente de confirmación de producto.
export const CANCELLATION_NOTICE_HOURS = 12;
export function sessionStartsAt(session: Pick<ConfirmedBooking, 'date' | 'time'>): number {
  if (!dayNameFromISO(session.date)) return NaN;
  return new Date(`${session.date}T00:00:00-05:00`).getTime() + parseTime(session.time) * 60_000;
}
export function canCancelSession(session: ConfirmedBooking, now = new Date()): boolean {
  return session.status === 'upcoming' && sessionStartsAt(session) - now.getTime() >= CANCELLATION_NOTICE_HOURS * 3_600_000;
}
export type SessionAction =
  | { type: 'cancel'; sessionId: string }
  | { type: 'validate'; sessionId: string }
  | { type: 'report'; sessionId: string; reason: string; category: IncidentCategory }
  | { type: 'rate'; sessionId: string; rating: number; comment: string };
export type MentorFixtureAction = { type: 'start' | 'perform' | 'close-incident'; sessionId: string; mentorId: string };
const categories: IncidentCategory[] = ['mentor_absent', 'student_absent', 'connection', 'not_held', 'completion_dispute', 'other'];

/** Adaptación de sessionLifecycle.ts de Make. El almacenamiento aplica la transición atómicamente. */
export function transitionSession(source: BookingLedger, action: SessionAction | MentorFixtureAction, now = new Date()): BookingLedger {
  const ledger = structuredClone(source);
  const session = ledger.sessions.find(item => item.id === action.sessionId);
  const fail = (message: string): never => { throw new BookingError('invalid_transition', message); };
  if (!session || session.studentId !== ledger.studentId) return fail('No encontramos esta sesión.');
  const at = now.toISOString();
  const event = (suffix: string, label: string, actor: 'student' | 'mentor' | 'system' = 'student') => {
    session.history ??= [{ id: `${session.id}:booked`, at: session.createdAt, label: 'Reserva confirmada', actor: 'system' }];
    session.history.push({ id: `${session.id}:${suffix}`, at, label, actor });
  };
  const notify = (suffix: string, title: string, description: string) => {
    ledger.notifications.unshift({ id: `NOT-${session.id}-${suffix}`, userId: ledger.studentId, title, description, date: 'Ahora', read: false, target: 'sessions' });
  };
  const hold = ledger.movements.find(item => item.reference === `${session.id}:hold`);
  const openIncident = ledger.incidents.find(item => item.sessionId === session.id && item.status !== 'closed');
  const requireHold = () => { if (!hold || hold.status !== 'pending' || ledger.wallet.held < session.credits) fail('No pudimos verificar los créditos retenidos.'); };
  if ('mentorId' in action) {
    if (action.mentorId !== session.mentorId) return fail('El mentor no corresponde a esta sesión.');
    if (action.type === 'start') {
      if (session.status === 'active') return source;
      if (session.status !== 'upcoming' || openIncident) return fail('La sesión no puede iniciarse.');
      session.status = 'active'; event('active', 'Sesión iniciada', 'mentor');
      notify('active', 'Sesión en curso', `${session.skill} con ${session.mentorName} comenzó.`);
    } else if (action.type === 'perform') {
      if (session.performedAt) return source;
      if (session.status !== 'active' || openIncident) return fail('La sesión no puede marcarse como realizada.');
      session.performedAt = at; session.status = 'validation'; event('performed', 'El mentor confirmó la realización', 'mentor');
      notify('validation', 'Mentoría pendiente de validación', 'Confirma que se realizó o reporta una incidencia. Los créditos siguen retenidos.');
    } else {
      // Fixture sin pantalla administrativa: solo cierra sin ajuste; jamás libera ni devuelve créditos.
      if (!openIncident || session.status !== 'review') return fail('No hay incidencia abierta.');
      openIncident.status = 'closed'; openIncident.resolvedAt = at;
      session.status = session.performedAt ? 'validation' : 'upcoming';
      event(`closed-${openIncident.id}`, 'Incidencia cerrada sin ajuste de créditos', 'system');
    }
    return ledger;
  }
  if (action.type === 'cancel') {
    if (session.status === 'cancelled') return source;
    if (!canCancelSession(session, now) || openIncident) return fail('Solo puedes cancelar reservas próximas con al menos 12 horas de anticipación.');
    requireHold();
    if (ledger.movements.some(item => item.reference === `${session.id}:refund`)) return fail('La devolución ya está registrada.');
    session.status = 'cancelled'; session.cancelledAt = at; session.cancellationReason = 'Cancelada por el estudiante.';
    session.refundStatus = `${session.credits} créditos devueltos`;
    ledger.wallet.available += session.credits; ledger.wallet.held -= session.credits;
    hold!.status = 'rejected';
    ledger.movements.unshift({ id: `MOV-${session.id}-refund`, reference: `${session.id}:refund`, sessionId: session.id, amount: session.credits, type: 'refund', status: 'completed', createdAt: at });
    event('cancelled', 'Reserva cancelada; créditos devueltos');
    notify('cancelled', 'Sesión cancelada', `Se devolvieron ${session.credits} créditos a tu saldo disponible.`);
  } else if (action.type === 'validate') {
    if (session.status === 'completed' && session.validatedAt) return source;
    if (session.status !== 'validation' || !session.performedAt || openIncident) return fail('La sesión requiere la confirmación del mentor y no debe tener incidencias abiertas.');
    requireHold();
    if (ledger.movements.some(item => item.reference === `${session.id}:spent` || item.reference === `${session.id}:earning`)) return fail('La liberación ya está registrada.');
    session.validatedAt = at; session.completedAt = at; session.status = 'completed';
    ledger.wallet.held -= session.credits; ledger.wallet.used += session.credits;
    ledger.mentorBalances[session.mentorId] = (ledger.mentorBalances[session.mentorId] ?? 0) + session.credits;
    hold!.status = 'completed';
    for (const type of ['spent', 'earning'] as const) ledger.movements.unshift({ id: `MOV-${session.id}-${type}`, reference: `${session.id}:${type}`, sessionId: session.id, amount: type === 'spent' ? -session.credits : session.credits, type, status: 'completed', createdAt: at, userId: type === 'spent' ? session.studentId : `mentor-${session.mentorId}` });
    event('validated', 'El estudiante confirmó la realización'); event('completed', 'Créditos liberados al mentor', 'system');
    notify('completed', 'Sesión completada', `Ambos participantes confirmaron. Se liberaron ${session.credits} créditos. Ya puedes valorar al mentor.`);
  } else if (action.type === 'report') {
    if (!['upcoming', 'active', 'validation'].includes(session.status) || openIncident) return fail('Esta sesión no admite otro reporte abierto.');
    const reason = action.reason.trim();
    if (!reason || reason.length > 1000 || !categories.includes(action.category)) return fail('Selecciona un motivo y describe lo ocurrido en un máximo de 1000 caracteres.');
    requireHold();
    const id = `INC-${session.id}-${crypto.randomUUID()}`;
    ledger.incidents.unshift({ id, sessionId: session.id, reporterId: ledger.studentId, category: action.category, reason, createdAt: at, status: 'open' });
    session.status = 'review'; event(id, 'Incidencia enviada; pendiente de revisión administrativa');
    notify(id, 'Sesión en revisión', 'Los créditos permanecen retenidos hasta la revisión administrativa.');
  } else {
    if (session.status !== 'completed' || !session.performedAt || !session.validatedAt || openIncident) return fail('Solo puedes valorar una sesión completada y validada.');
    if (session.rated || ledger.reviews.some(item => item.sessionId === session.id)) return fail('Esta sesión ya tiene una valoración.');
    if (!Number.isInteger(action.rating) || action.rating < 1 || action.rating > 5 || action.comment.trim().length > ACADEMIC_CREDIT_CONFIG.reviewCommentMaxLength) return fail('Elige entre 1 y 5 estrellas y respeta el límite del comentario.');
    session.rated = true; session.rating = action.rating; session.reviewedAt = at;
    ledger.reviews.unshift({ id: `REV-${session.id}`, sessionId: session.id, studentId: session.studentId, mentorId: session.mentorId, skill: session.skill, topic: session.topic, rating: action.rating, comment: action.comment.trim(), createdAt: at });
    event('rated', 'Valoración enviada'); notify('rated', 'Calificación enviada', `Se actualizó la valoración de ${session.mentorName}.`);
  }
  return ledger;
}
