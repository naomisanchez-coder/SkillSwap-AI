import { localActivity, localIdentity, learnerFixtures } from './localActivity';
import { mockStudentService } from './studentMock';
import { defaultMentorSettings, sessionMentorOwner, type MentorWorkspace } from '../data/mentor';
import { BookingError, type BookingCommand } from '../data/booking';
import type { SessionAction } from '../data/sessionLifecycle';
import type { MentorService } from '../services/mentor';

function assertDevelopment() { if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_FRONTEND_PREVIEW !== 'true') throw new Error('Servicio de prueba disponible solo en desarrollo.'); }
async function workspace(): Promise<MentorWorkspace> {
  assertDevelopment();
  const { state } = await mockStudentService.getDashboard();
  const approved = state.account?.requests.filter(item => item.status === 'approved' && item.ownerUserId === state.profile.id) ?? [];
  if (!approved.length) throw new BookingError('mentor_unavailable', 'Necesitas una habilidad aprobada para acceder a la vista de mentor.');
  const ledger = state.activity!;
  const sessions = ledger.sessions.filter(item => sessionMentorOwner(item) === state.profile.id);
  return { profile: state.profile, approved, settings: ledger.mentorSettings?.[state.profile.id] ?? defaultMentorSettings(), sessions,
    reviews: ledger.reviews.filter(review => sessions.some(session => session.id === review.sessionId && session.status === 'completed')), ledger };
}
export const mockMentorService: MentorService = {
  getWorkspace: workspace,
  async saveAvailability(draft) { assertDevelopment(); await localActivity.saveMentorAvailability(draft); return workspace(); },
  async saveOffer(id, draft) { assertDevelopment(); await localActivity.saveMentorOffer(id, draft); return workspace(); },
  async updateSession(action) { assertDevelopment(); return localActivity.updateMentorSession(action); },
};
/** Fixture de otro estudiante: no concede al mentor el poder de validar sus propias sesiones. */
export async function reserveMentorFixture(command: BookingCommand, learnerId: keyof typeof learnerFixtures = 'fixture-elena') {
  assertDevelopment();
  if (learnerId === (localIdentity.id as string)) throw new Error('No se permite autorreserva.');
  return localActivity.reserveFixtureStudent(command, learnerId);
}
export async function confirmLearnerFixture(action: SessionAction, learnerId: keyof typeof learnerFixtures = 'fixture-elena') {
  assertDevelopment(); return localActivity.updateFixtureStudent(action, learnerId);
}
