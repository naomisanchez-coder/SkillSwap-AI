import type { Mentor } from './mentors';
import type { NotificationRecord, ReviewRecord, SessionRecord, WalletBalance } from './student';
import type { SessionDuration } from './creditConfig';
import { intervalsOverlap, isSlotAvailable, parseTime } from './scheduling';
import type { MentorSettings } from './mentor';
import type { AdminAudit, IncidentResolution } from './admin';
import type { MeetingPlatform } from './meeting';

export type BookingCommand = { id: string; mentorId: string; date: string; time: string; duration: SessionDuration };
export type BookingDraft = BookingCommand & { step: 'schedule' | 'duration' | 'confirm' | 'success' };
export type ConfirmedBooking = SessionRecord & {
  serverManaged?: boolean;
  learnerName: string; topic: string; credits: number; createdAt: string;
  reservedSlotKeys: string[]; meetingPlatform: MeetingPlatform; meetingUrl: string | null; meetingAssignedAt?: string;
  performedAt?: string; validatedAt?: string; completedAt?: string; cancelledAt?: string;
  cancellationReason?: string; refundStatus?: string; rated?: boolean;
  rating?: number; reviewedAt?: string; history?: SessionEvent[];
  mentorOwnerId?: string; offerRequestId?: string;
  adminResolution?: { incidentId: string; at: string; adminId: string };
};
export type SessionEvent = { id: string; at: string; label: string; actor: 'student' | 'mentor' | 'system' };
export type IncidentCategory = 'mentor_absent' | 'student_absent' | 'connection' | 'not_held' | 'completion_dispute' | 'other';
export type IncidentRecord = { id: string; sessionId: string; reporterId: string; category: IncidentCategory; reason: string; createdAt: string; status: 'open' | 'in_review' | 'closed' | 'resolved'; resolvedAt?: string; resolution?: IncidentResolution; resolutionComment?: string; resolvedBy?: string };
export type BookingContext = {
  serverManaged?: boolean;
  mentor: Mentor; studentId: string; userName: string; wallet: WalletBalance;
  sessions: SessionRecord[]; reservedSlots: string[];
};
export type BookingResult = { session: ConfirmedBooking; wallet: WalletBalance; notifications: NotificationRecord[]; ledger: BookingLedger };
export type CreditMovement = { id: string; reference: string; sessionId: string; amount: number; status: 'pending' | 'completed' | 'rejected'; type: 'initial_grant' | 'hold' | 'refund' | 'spent' | 'earning'; createdAt: string; userId?: string };
export type BookingLedger = {
  serverManaged?: boolean;
  version: 1; studentId: string; wallet: WalletBalance; sessions: ConfirmedBooking[];
  movements: CreditMovement[]; notifications: NotificationRecord[];
  incidents: IncidentRecord[]; reviews: ReviewRecord[]; mentorBalances: Record<string, number>;
  wallets?: Record<string, WalletBalance>;
  mentorSettings?: Record<string, MentorSettings>;
  suspendedUserIds?: string[];
  adminAuditLog?: AdminAudit[];
};

export class BookingError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = 'BookingError'; this.code = code; }
}

export function isBookingSlotAvailable(context: BookingContext, date: string, time: string, duration: number): boolean {
  if (context.serverManaged) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
    const start = parseTime(time);
    const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
    if (!context.mentor.availabilityWindows?.some(window => window.weekday === weekday && start >= minutes(window.start) && start + duration <= minutes(window.end))) return false;
  }
  if (!isSlotAvailable({ mentorId: context.mentor.id, date, time, duration, availability: context.mentor.slots, sessions: context.sessions, reservedSlots: context.reservedSlots })) return false;
  const start = parseTime(time);
  return !context.sessions.some(session => (session.studentId === context.studentId || session.mentorOwnerId === context.studentId) && session.status !== 'cancelled' && session.date === date && intervalsOverlap(start, start + duration, parseTime(session.time), parseTime(session.time) + session.duration));
}
