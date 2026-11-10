import type { MentorProfileDetails, StudentDashboardSnapshot } from '../data/student';
import type { BookingCommand, BookingContext, BookingDraft, BookingResult, ConfirmedBooking } from '../data/booking';

/** Contrato del panel: los datos de prueba se resuelven fuera de los componentes. */
export interface StudentService {
  getDashboard(): Promise<StudentDashboardSnapshot>;
  markNotificationRead(id: string): Promise<void>;
  getMentorProfile(id: string): Promise<MentorProfileDetails | null>;
  getBookingContext(mentorId: string): Promise<BookingContext | null>;
  confirmBooking(command: BookingCommand): Promise<BookingResult>;
  getBooking(id: string): Promise<ConfirmedBooking | null>;
  getBookingDraft(): Promise<BookingDraft | null>;
  saveBookingDraft(draft: BookingDraft): Promise<void>;
  clearBookingDraft(): Promise<void>;
}
