import type { MentorProfileDetails, StudentDashboardSnapshot } from '../data/student';

/** Contrato del panel: los datos de prueba se resuelven fuera de los componentes. */
export interface StudentService {
  getDashboard(): Promise<StudentDashboardSnapshot>;
  markNotificationRead(id: string): Promise<void>;
  getMentorProfile(id: string): Promise<MentorProfileDetails | null>;
}
