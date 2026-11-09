import { validateProfileStep, type OnboardingPreferences } from './profileOptions';
import type { Mentor } from './mentors';

// Subconjunto del modelo original necesario para el panel, sin migradores ni economía global.
export type UserProfile = OnboardingPreferences & {
  id: string; name: string; email: string; institution: string;
  career: string; cycle: number; bio: string; photo?: string;
};
export type WalletBalance = { available: number; held: number; used: number; earned: number };
export type SessionRecord = {
  id: string; studentId: string; mentorId: string; mentorName: string;
  skill: string; date: string; time: string; duration: 30 | 60 | 90;
  status: 'upcoming' | 'active' | 'validation' | 'completed' | 'cancelled' | 'review';
};
export type SkillRequest = { id: string; ownerUserId: string; status: 'pending' | 'observation' | 'approved' | 'rejected' };
export type NotificationRecord = { id: string; userId: string; title: string; description: string; date: string; read: boolean; target: string };
export type StudentDashboardData = {
  profile: UserProfile; wallet: WalletBalance; sessions: SessionRecord[];
  skillRequests: SkillRequest[]; notifications: NotificationRecord[];
  mentorRatings: Record<string, { average: number; count: number }>;
};
export type StudentDashboardSnapshot = { state: StudentDashboardData; mentors: Mentor[] };
export type ReviewRecord = {
  id: string; sessionId: string; studentId: string; mentorId: string;
  skill?: string; topic?: string; rating: number; comment: string; createdAt: string;
};
export type MentorProfileDetails = { mentor: Mentor; rating: { average: number; count: number }; reviews: ReviewRecord[] };

export function hasCompletePreferences(profile: OnboardingPreferences): boolean {
  return [1, 2, 3, 4].every(step => validateProfileStep(profile, step) === null);
}
