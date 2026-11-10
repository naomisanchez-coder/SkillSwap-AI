import type { Mentor } from './mentors';
import type { NotificationRecord, SessionRecord, WalletBalance } from './student';
import type { SessionDuration } from './creditConfig';
import { intervalsOverlap, isSlotAvailable, parseTime } from './scheduling';

export type BookingCommand = { id: string; mentorId: string; date: string; time: string; duration: SessionDuration };
export type BookingDraft = BookingCommand & { step: 'schedule' | 'duration' | 'confirm' | 'success' };
export type ConfirmedBooking = SessionRecord & {
  learnerName: string; topic: string; credits: number; createdAt: string;
  reservedSlotKeys: string[]; meetingPlatform: null; meetingUrl: null;
};
export type BookingContext = {
  mentor: Mentor; studentId: string; userName: string; wallet: WalletBalance;
  sessions: SessionRecord[]; reservedSlots: string[];
};
export type BookingResult = { session: ConfirmedBooking; wallet: WalletBalance; notifications: NotificationRecord[] };
export type CreditHold = { id: string; reference: string; sessionId: string; amount: number; status: 'pending'; type: 'hold'; createdAt: string };
export type BookingLedger = {
  version: 1; studentId: string; wallet: WalletBalance; sessions: ConfirmedBooking[];
  movements: CreditHold[]; notifications: NotificationRecord[];
};

export class BookingError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = 'BookingError'; this.code = code; }
}

export function isBookingSlotAvailable(context: BookingContext, date: string, time: string, duration: number): boolean {
  if (!isSlotAvailable({ mentorId: context.mentor.id, date, time, duration, availability: context.mentor.slots, sessions: context.sessions, reservedSlots: context.reservedSlots })) return false;
  const start = parseTime(time);
  return !context.sessions.some(session => session.studentId === context.studentId && session.status !== 'cancelled' && session.date === date && intervalsOverlap(start, start + duration, parseTime(session.time), parseTime(session.time) + session.duration));
}
