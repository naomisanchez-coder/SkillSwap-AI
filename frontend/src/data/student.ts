import { validateProfileStep, type OnboardingPreferences } from './profileOptions';
import type { Mentor } from './mentors';
import type { BookingLedger } from './booking';
import type { AccountData } from './account';

// Subconjunto del modelo original necesario para el panel, sin migradores ni economía global.
export type UserProfile = OnboardingPreferences & {
  serverOnboardingComplete?: boolean;
  id: string; name: string; email: string; institution: string;
  career: string; cycle: number; bio: string; photo?: string; photoStorageId?: string;
};
export type WalletBalance = { available: number; held: number; used: number; earned: number; total?: number };
export type SessionRecord = {
  id: string; studentId: string; mentorId: string; mentorName: string;
  skill: string; date: string; time: string; duration: 30 | 60 | 90;
  status: 'upcoming' | 'active' | 'validation' | 'completed' | 'cancelled' | 'review';
  mentorOwnerId?: string;
};
export type SkillRequest = { id: string; ownerUserId: string; status: 'pending' | 'observation' | 'approved' | 'rejected' };
export type NotificationRecord = { id: string; userId: string; title: string; description: string; date: string; read: boolean; target: string; sessionId?: string; requestId?: string };
export type StudentDashboardData = {
  serverProgress?: { completedSessions: number; completedMinutes: number; reviewedSessions: number };
  profile: UserProfile; wallet: WalletBalance; sessions: SessionRecord[];
  skillRequests: SkillRequest[]; notifications: NotificationRecord[];
  mentorRatings: Record<string, { average: number; count: number }>;
  activity?: BookingLedger;
  reviews?: ReviewRecord[];
  account?: AccountData;
};
export type StudentDashboardSnapshot = { state: StudentDashboardData; mentors: Mentor[] };
export type ReviewRecord = {
  id: string; sessionId: string; studentId: string; mentorId: string;
  skill?: string; topic?: string; rating: number; comment: string; createdAt: string;
};
export type MentorProfileDetails = { mentor: Mentor; rating: { average: number; count: number }; reviews: ReviewRecord[] };

export function summarizeMentorReviews(reviews: ReviewRecord[], mentorId: string) {
  const items = reviews.filter(item => item.mentorId === mentorId);
  return { average: items.length ? Math.round(items.reduce((sum, item) => sum + item.rating, 0) / items.length * 10) / 10 : 0, count: items.length };
}

export function hasCompletePreferences(profile: OnboardingPreferences): boolean {
  if ('serverOnboardingComplete' in profile) return profile.serverOnboardingComplete === true;
  return [1, 2, 3, 4].every(step => validateProfileStep(profile, step) === null);
}
