import { emptyPreferences } from '../data/profileOptions';
import type { StudentDashboardData } from '../data/student';
import type { StudentService } from '../services/student';
import { mockProfileService } from './profileMock';
import { mentors, reviewFixtures } from './mentorFixtures';
import { isEligibleMentor } from '../data/recommendations';
import { ACADEMIC_CREDIT_CONFIG } from '../data/creditConfig';

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
  async getMentorProfile(id) {
    assertDevelopment();
    const mentor = mentors.find(item => item.id === id);
    if (!mentor || !isEligibleMentor(mentor, studentFixture.profile.id)) return null;
    return structuredClone({ mentor, rating: studentFixture.mentorRatings[id], reviews: reviewFixtures.filter(review => review.mentorId === id) });
  },
  async getDashboard() {
    assertDevelopment();
    const preferences = await mockProfileService.getPreferences();
    const readIds = readNotificationIds();
    const state = structuredClone(studentFixture);
    state.profile = { ...state.profile, ...(preferences ?? emptyPreferences()) };
    state.notifications = state.notifications.map(item => ({ ...item, read: readIds.includes(item.id) }));
    return { state, mentors: structuredClone(mentors) };
  },
  async markNotificationRead(id) {
    assertDevelopment();
    if (!studentFixture.notifications.some(item => item.id === id && item.userId === studentFixture.profile.id)) throw new Error('Notificación no disponible.');
    localStorage.setItem(studentActivityStorageKey, JSON.stringify([...new Set([...readNotificationIds(), id])]));
  },
};
