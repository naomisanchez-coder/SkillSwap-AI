import { emptyPreferences } from '../data/profileOptions';
import type { StudentDashboardData } from '../data/student';
import { summarizeMentorReviews } from '../data/student';
import type { StudentService } from '../services/student';
import { mockProfileService } from './profileMock';
import { mentors, reviewFixtures } from './mentorFixtures';
import { isEligibleMentor } from '../data/recommendations';
import { ACADEMIC_CREDIT_CONFIG } from '../data/creditConfig';
import { localActivity } from './localActivity';
import { mockAccountService } from './accountMock';

export const studentActivityStorageKey = 'skillswap:frontend-demo:student:v1';
// Fixtures referenciales del prototipo. No otorgan créditos ni modifican cuentas reales.
export const studentFixture: StudentDashboardData = {
  profile: { id: 'frontend-demo-student', name: 'Alex', email: 'alex@example.test', institution: 'TECSUP', career: 'Diseño y Desarrollo de Software', cycle: 3, bio: '', ...emptyPreferences() },
  wallet: { available: ACADEMIC_CREDIT_CONFIG.initialVerifiedStudentBalance, held: 0, used: 0, earned: 0 },
  sessions: [], skillRequests: [],
  mentorRatings: Object.fromEntries(mentors.map(mentor => {
    const reviews = reviewFixtures.filter(review => review.mentorId === mentor.id);
    return [mentor.id, { average: reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0, count: reviews.length }];
  })),
  notifications: [{ id: 'profile-welcome', userId: 'frontend-demo-student', title: 'Tus preferencias de aprendizaje', description: 'Puedes actualizar tus intereses y horarios cuando lo necesites.', date: 'Hoy', read: false, target: 'profile' }],
};

const bookings = localActivity;

function assertDevelopment() {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_FRONTEND_PREVIEW !== 'true') throw new Error('Servicio de prueba disponible solo en desarrollo.');
}
function readNotificationIds(): string[] {
  const stored = localStorage.getItem(studentActivityStorageKey);
  if (!stored) return [];
  try {
    const value: unknown = JSON.parse(stored);
    return Array.isArray(value) && value.every(id => typeof id === 'string') ? value : [];
  } catch { return []; }
}
export const mockStudentService: StudentService = {
  async updateSession(action) { assertDevelopment(); return bookings.updateSession(action); },
  async getBookingContext(id) { assertDevelopment(); const account = await mockAccountService.getAccount(); return bookings.getBookingContext(id, account.profile.name ?? studentFixture.profile.name); },
  async confirmBooking(command) { assertDevelopment(); const account = await mockAccountService.getAccount(); return bookings.confirmBooking(command, account.profile.name ?? studentFixture.profile.name); },
  async getBooking(id) { assertDevelopment(); return bookings.getBooking(id); },
  async getBookingDraft() { assertDevelopment(); return bookings.getBookingDraft(); },
  async saveBookingDraft(draft) { assertDevelopment(); return bookings.saveBookingDraft(draft); },
  async clearBookingDraft() { assertDevelopment(); return bookings.clearBookingDraft(); },
  async getMentorProfile(id) {
    assertDevelopment();
    const mentor = (await bookings.getMentorCatalog()).find(item => item.id === id);
    if (!mentor || !isEligibleMentor(mentor, studentFixture.profile.id)) return null;
    const ledger = await bookings.getLedger();
    const reviews = [...ledger.reviews, ...reviewFixtures].filter(review => review.mentorId === id);
    return structuredClone({ mentor, rating: summarizeMentorReviews(reviews, id), reviews });
  },
  async getDashboard() {
    assertDevelopment();
    const preferences = await mockProfileService.getPreferences();
    const readIds = readNotificationIds();
    const state = structuredClone(studentFixture);
    const account = await mockAccountService.getAccount();
    state.account = account;
    state.skillRequests = [...account.requests, ...state.skillRequests];
    const ledger = await bookings.getLedger();
    state.activity = ledger;
    state.reviews = [...ledger.reviews, ...reviewFixtures];
    const catalog = await bookings.getMentorCatalog();
    state.mentorRatings = Object.fromEntries(catalog.map(mentor => [mentor.id, summarizeMentorReviews(state.reviews!, mentor.id)]));
    state.wallet = ledger.wallet;
    state.sessions = [...ledger.sessions.filter(item => item.studentId === state.profile.id), ...state.sessions];
    state.notifications = [...account.notifications, ...ledger.notifications, ...state.notifications];
    state.profile = { ...state.profile, ...account.profile, ...(preferences ?? emptyPreferences()) };
    state.notifications = state.notifications.map(item => ({ ...item, read: readIds.includes(item.id) }));
    return { state, mentors: structuredClone(catalog) };
  },
  async markNotificationRead(id) {
    assertDevelopment();
    const ledger = await bookings.getLedger();
    const account = await mockAccountService.getAccount();
    if (![...studentFixture.notifications, ...ledger.notifications, ...account.notifications].some(item => item.id === id && item.userId === studentFixture.profile.id)) throw new Error('Notificación no disponible.');
    localStorage.setItem(studentActivityStorageKey, JSON.stringify([...new Set([...readNotificationIds(), id])]));
  },
};

/** Fixtures de acciones del mentor, sin botones ni acceso desde el servicio estudiantil. */
export async function applyMentorFixture(action: import('../data/sessionLifecycle').MentorFixtureAction) {
  assertDevelopment();
  return bookings.applyMentorFixture(action);
}
