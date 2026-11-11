import { api } from './http';
import type { AuthSession } from './auth';
import { createProfileServices, profileView } from './apiProfile';
import { apiCatalogService, readAvailability, readMentor } from './apiCatalog';
import type { StudentService } from './student';
import type { BookingDraft, BookingLedger, ConfirmedBooking, CreditMovement } from '../data/booking';
import { BookingError } from '../data/booking';
import { formatTime, parseTime } from '../data/scheduling';

type ApiSession = { id: string; student: { id: string; firstName: string; lastName: string }; mentor: { id: string; firstName: string; lastName: string }; skill: { name: string }; status: string; startsAt: string; durationMinutes: 30 | 60 | 90; creditCost: number; meetingUrl: string | null; review: { rating: number; comment: string | null } | null };
type Credits = { total: number; available: number; held: number; used: number; earned: number; transactions: { id: string; amount: number; reason: string; reference: string; occurredAt: string; holdStatus: string | null }[]; pagination: { nextCursor: string | null } };
export function sessionView(s: ApiSession): ConfirmedBooking {
  const local = new Date(new Date(s.startsAt).getTime() - 5 * 3600000).toISOString();
  const status = ({ UPCOMING: 'upcoming', ACTIVE: 'active', AWAITING_VALIDATION: 'validation', COMPLETED: 'completed', CANCELLED: 'cancelled' } as Record<string, ConfirmedBooking['status']>)[s.status];
  if (!status) throw new Error('Estado de sesión desconocido.');
  return { id: s.id, studentId: s.student.id, mentorId: s.mentor.id, mentorOwnerId: s.mentor.id, mentorName: `${s.mentor.firstName} ${s.mentor.lastName}`, learnerName: `${s.student.firstName} ${s.student.lastName}`,
    skill: s.skill.name, topic: s.skill.name, date: local.slice(0, 10), time: formatTime(Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16))), duration: s.durationMinutes,
    status, credits: s.creditCost, createdAt: '', reservedSlotKeys: [], meetingPlatform: s.meetingUrl ? s.meetingUrl.includes('meet.google.com') ? 'google_meet' : s.meetingUrl.includes('zoom.us') ? 'zoom' : 'webex' : null,
    meetingUrl: s.meetingUrl, rated: Boolean(s.review), rating: s.review?.rating, refundStatus: status === 'cancelled' ? 'refunded' : undefined, serverManaged: true };
}
export function createStudentServices(session: AuthSession) {
  const { account, preferences, readProfile } = createProfileServices(session);
  let draft: BookingDraft | null = null;
  let confirmedDraft: string | null = null;
  const request = <T>(path: string, method?: string, body?: unknown) => api<T>(`/student${path}`, { method, body, csrf: session.csrfToken });
  const readCredits = async (): Promise<Credits> => {
    const result = (await request<{ credits: Credits }>('/credits?limit=50')).credits;
    let cursor = result.pagination.nextCursor;
    while (cursor) {
      const page = (await request<{ credits: Credits }>(`/credits?limit=50&cursor=${encodeURIComponent(cursor)}`)).credits;
      result.transactions.push(...page.transactions); cursor = page.pagination.nextCursor;
    }
    return result;
  };
  const readLedger = async (): Promise<BookingLedger> => {
    const [credits, { sessions }] = await Promise.all([readCredits(), request<{ sessions: ApiSession[] }>('/sessions?limit=50')]);
    const own = sessions.filter(s => s.student.id === session.user.id).map(sessionView);
    const movements: CreditMovement[] = credits.transactions.map(t => {
      const sessionId = /^session:([^:]+):/.exec(t.reference)?.[1] ?? '';
      const type: CreditMovement['type'] = t.reason === 'INITIAL_EMAIL_VERIFICATION' ? 'initial_grant' : t.reason === 'SESSION_EARNING' ? 'earning' : t.reason === 'SESSION_REFUND' ? 'refund' : t.holdStatus === 'SETTLED' ? 'spent' : 'hold';
      return { id: t.id, reference: t.reference, sessionId, amount: t.amount, type, createdAt: t.occurredAt, status: t.holdStatus === 'HELD' ? 'pending' : 'completed', userId: session.user.id };
    });
    return { version: 1, studentId: session.user.id, wallet: { available: credits.available, held: credits.held, used: credits.used, earned: credits.earned, total: credits.total },
      sessions: own, movements, notifications: [], incidents: [], reviews: [], mentorBalances: {}, serverManaged: true };
  };
  const student: StudentService = {
    async getDashboard() {
      const [profile, activity, accountData, mentors, { dashboard }] = await Promise.all([readProfile(), readLedger(), account.getAccount(), apiCatalogService.getMentors(), request<{ dashboard: { progress: { completedSessions: number; completedMinutes: number; reviewedSessions: number } } }>('/dashboard')]);
      return { state: { profile: profileView(profile), wallet: activity.wallet, sessions: activity.sessions, account: accountData, skillRequests: accountData.requests, notifications: [], mentorRatings: {}, activity, serverProgress: dashboard.progress }, mentors };
    },
    async markNotificationRead() { throw new Error('Las notificaciones no están disponibles en esta etapa.'); },
    async getMentorProfile(id) { return { mentor: await readMentor(id), rating: { average: 0, count: 0 }, reviews: [] }; },
    async getBookingContext(id) {
      const [mentor, availability, ledger, { sessions }] = await Promise.all([readMentor(id), readAvailability(id), readLedger(), request<{ sessions: ApiSession[] }>('/sessions?limit=50')]);
      const busy = availability.busy.map((s, index) => sessionView({ id: `busy-${index}`, student: { id: '', firstName: '', lastName: '' }, mentor: { id, firstName: '', lastName: '' }, skill: { name: '' }, status: 'UPCOMING', startsAt: s.startsAt, durationMinutes: Math.round((Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 60000) as 30, creditCost: 0, meetingUrl: null, review: null }));
      return { mentor, studentId: session.user.id, userName: session.user.name, wallet: ledger.wallet, sessions: [...sessions.map(sessionView), ...busy], reservedSlots: [], serverManaged: true };
    },
    async confirmBooking(command) {
      const mentor = await readMentor(command.mentorId);
      const minutes = parseTime(command.time);
      if (!Number.isFinite(minutes)) throw new BookingError('VALIDATION_ERROR', 'Selecciona un horario válido.');
      const startsAt = new Date(new Date(`${command.date}T00:00:00-05:00`).getTime() + minutes * 60000).toISOString();
      const requestId = command.id.replace(/^SES-/, '');
      try {
        const result = await request<{ session: ApiSession }>('/bookings', 'POST', { requestId, offerId: mentor.requestId, startsAt, durationMinutes: command.duration });
        confirmedDraft = result.session.id;
        const ledger = await readLedger();
        return { session: sessionView(result.session), wallet: ledger.wallet, ledger, notifications: [] };
      } catch (error) { throw new BookingError('BOOKING_FAILED', error instanceof Error ? error.message : 'No se pudo reservar.'); }
    },
    async getBooking(id) { if (id === draft?.id && !confirmedDraft) return null; const result = await request<{ session: ApiSession }>(`/sessions/${encodeURIComponent(id === draft?.id && confirmedDraft ? confirmedDraft : id)}`); return sessionView(result.session); },
    async getBookingDraft() { return draft; },
    async saveBookingDraft(value) { draft = value; },
    async clearBookingDraft() { draft = null; confirmedDraft = null; },
    async updateSession(action) {
      if (action.type === 'report') throw new BookingError('UNAVAILABLE', 'El reporte de incidencias todavía no está disponible.');
      const endpoint = action.type === 'rate' ? 'reviews' : action.type;
      try { await request(`/sessions/${encodeURIComponent(action.sessionId)}/${endpoint}`, 'POST', action.type === 'rate' ? { rating: action.rating, comment: action.comment } : {}); return await readLedger(); }
      catch (error) { throw new BookingError('SESSION_UPDATE_FAILED', error instanceof Error ? error.message : 'No se pudo actualizar la sesión.'); }
    },
  };
  return { student, account, preferences };
}
