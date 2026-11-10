import type { BookingLedger } from '../data/booking';
import type { MentorSessionAction, MentorWorkspace, OfferSettings } from '../data/mentor';
import type { WeeklyAvailability } from '../data/scheduling';

export interface MentorService {
  getWorkspace(): Promise<MentorWorkspace>;
  saveAvailability(availability: WeeklyAvailability): Promise<MentorWorkspace>;
  saveOffer(requestId: string, offer: OfferSettings): Promise<MentorWorkspace>;
  updateSession(action: MentorSessionAction): Promise<BookingLedger>;
}
