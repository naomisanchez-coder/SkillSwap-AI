import type { NotificationRecord } from './student';
import type { BookingLedger, ConfirmedBooking } from './booking';
import type { MentorSkillRequest } from './account';
import { sessionMentorOwner } from './mentor';

export type NotificationDestination =
  | { type: 'session'; id: string; role: 'student' | 'mentor'; status: ConfirmedBooking['status'] }
  | { type: 'request'; id: string }
  | { type: 'page'; page: 'dashboard' | 'wallet' | 'profile' | 'discover' | 'explore' }
  | { type: 'unavailable' };

/** Las notificaciones antiguas se relacionan con los IDs conservados en el historial.
 * Nunca se deduce el destino a partir del título, ni se abre una entidad ajena.
 */
export function notificationDestination(item: NotificationRecord, userId: string, ledger: BookingLedger | undefined, requests: MentorSkillRequest[], mentorEnabled: boolean): NotificationDestination {
  if (item.userId !== userId) return { type: 'unavailable' };
  if (item.target === 'skills') {
    const matches = requests.filter(request => request.ownerUserId === userId && (item.requestId !== undefined ? request.id === item.requestId
      : item.id === `NOT-${request.submissionId}-skill` || request.history.some(event => item.id === `NOT-${event.id}-review` || (event.id.startsWith('SUB-') && item.id === `NOT-${event.id.slice(4)}-skill`))));
    return matches.length === 1 ? { type: 'request', id: matches[0].id } : { type: 'unavailable' };
  }
  if (item.target === 'sessions' || item.target === 'mentor-sessions') {
    const role = item.target === 'mentor-sessions' ? 'mentor' : 'student';
    if (role === 'mentor' && !mentorEnabled) return { type: 'unavailable' };
    const matches = ledger?.sessions.filter(session => (role === 'student' ? session.studentId === userId : sessionMentorOwner(session) === userId)
      && (item.sessionId !== undefined ? item.sessionId === session.id : item.id.startsWith(`NOT-${session.id}-`)
        || ledger.incidents.some(incident => incident.sessionId === session.id && item.id.startsWith(`NOT-${incident.id}-`)))) ?? [];
    return matches.length === 1 ? { type: 'session', id: matches[0].id, role, status: matches[0].status } : { type: 'unavailable' };
  }
  if (['dashboard', 'wallet', 'profile', 'discover', 'explore'].includes(item.target)) return { type: 'page', page: item.target as 'dashboard' | 'wallet' | 'profile' | 'discover' | 'explore' };
  return { type: 'unavailable' };
}
