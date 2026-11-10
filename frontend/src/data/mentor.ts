import type { AccountData, MentorSkillRequest } from './account';
import type { BookingLedger, ConfirmedBooking } from './booking';
import { BookingError } from './booking';
import type { UserProfile, ReviewRecord } from './student';
import type { Mentor } from './mentors';
import { ACADEMIC_CREDIT_CONFIG, type SessionDuration } from './creditConfig';
import { ACTIVE_SKILLS } from './skillCatalog';
import { dayNameFromISO, isWithinAvailability, parseTime, type WeeklyAvailability } from './scheduling';
import { sessionStartsAt } from './sessionLifecycle';

export const mentorDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const mentorTimes = ['5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM'];
export type OfferSettings = { topic: string; description: string; level: string; durations: SessionDuration[]; active: boolean };
export type MentorSettings = { availability: WeeklyAvailability; offers: Record<string, OfferSettings> };
export type MentorSessionAction = { type: 'start' | 'perform'; sessionId: string } | { type: 'report'; sessionId: string; reason: string; category: import('./booking').IncidentCategory };
export type MentorWorkspace = { profile: UserProfile; approved: MentorSkillRequest[]; settings: MentorSettings; sessions: ConfirmedBooking[]; reviews: ReviewRecord[]; ledger: BookingLedger };
export function mentorOwnerId(mentorId: string): string {
  return mentorId.startsWith('student-mentor-') ? mentorId.slice('student-mentor-'.length).split(':')[0] : `mentor-${mentorId}`;
}
export function sessionMentorOwner(session: Pick<ConfirmedBooking, 'mentorId' | 'mentorOwnerId'>): string { return session.mentorOwnerId ?? mentorOwnerId(session.mentorId); }
export function defaultMentorSettings(): MentorSettings { return { availability: {}, offers: {} }; }
export function defaultOffer(request: MentorSkillRequest): OfferSettings { return { topic: request.topics.split(',')[0]?.trim() || request.skill, description: request.experience, level: request.level, durations: [30, 60, 90], active: false }; }
export function normalizeOffer(value: OfferSettings): OfferSettings {
  if (typeof value.topic !== 'string' || !value.topic.trim() || value.topic.trim().length > 200 || typeof value.description !== 'string' || !value.description.trim() || value.description.trim().length > 2000
    || !['Principiante', 'Intermedio', 'Avanzado'].includes(value.level) || !Array.isArray(value.durations) || !value.durations.length || value.durations.some(item => ![30, 60, 90].includes(item)) || typeof value.active !== 'boolean') throw new BookingError('invalid_offer', 'Indica tema, descripción, nivel y al menos una duración válida.');
  return { topic: value.topic.trim(), description: value.description.trim(), level: value.level, durations: [...new Set(value.durations)].sort((a, b) => a - b), active: value.active };
}
export function normalizeAvailability(value: WeeklyAvailability): WeeklyAvailability {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(day => !mentorDays.includes(day) || !Array.isArray(value[day]) || value[day].some(time => !mentorTimes.includes(time)))) throw new BookingError('invalid_availability', 'Usa únicamente los días y bloques horarios disponibles.');
  return Object.fromEntries(mentorDays.filter(day => value[day]?.length).map(day => [day, [...new Set(value[day])].sort((a, b) => parseTime(a) - parseTime(b))]));
}
export function availabilityPreservesBookings(draft: WeeklyAvailability, sessions: ConfirmedBooking[], ownerId: string, now = new Date()): boolean {
  return sessions.filter(session => sessionMentorOwner(session) === ownerId && session.status !== 'cancelled' && sessionStartsAt(session) + session.duration * 60_000 > now.getTime())
    .every(session => isWithinAvailability(draft, session.date, session.time, session.duration));
}
export function reservedAvailabilityBlock(day: string, time: string, settings: MentorSettings, sessions: ConfirmedBooking[], ownerId: string, now = new Date()): boolean {
  if (!settings.availability[day]?.includes(time)) return false;
  const draft = { ...settings.availability, [day]: settings.availability[day].filter(item => item !== time) };
  return !availabilityPreservesBookings(draft, sessions.filter(session => dayNameFromISO(session.date) === day), ownerId, now);
}
/** Una identidad de oferta por solicitud; todas comparten propietario, horarios y solapamientos. */
export function publishedMentors(account: AccountData, ledger: BookingLedger, profile: Pick<UserProfile, 'name' | 'bio'>): Mentor[] {
  const settings = ledger.mentorSettings?.[account.userId] ?? defaultMentorSettings();
  return account.requests.filter(request => request.status === 'approved' && request.ownerUserId === account.userId).map(request => {
    const offer = settings.offers[request.id] ?? defaultOffer(request);
    const skill = ACTIVE_SKILLS.find(item => item.name === request.skill);
    const id = `student-mentor-${account.userId}:${request.id}`;
    return { id, ownerUserId: account.userId, requestId: request.id, name: profile.name, skill: request.skill, level: offer.level,
      rating: 0, sessions: ledger.sessions.filter(session => session.mentorId === id && session.status === 'completed').length, availability: Object.keys(settings.availability).join(', '), modalities: ['Virtual'], skillValidated: Boolean(skill), image: '', bio: profile.bio,
      slots: settings.availability, topics: request.topics.split(',').map(item => item.trim()).filter(Boolean), portfolio: request.portfolio, active: offer.active,
      offer: { skillId: skill?.id ?? '', topic: offer.topic, description: offer.description, level: offer.level, durations: offer.durations, availability: Object.keys(settings.availability).join(', '), costByDuration: { ...ACADEMIC_CREDIT_CONFIG.sessionCosts } },
    };
  });
}
