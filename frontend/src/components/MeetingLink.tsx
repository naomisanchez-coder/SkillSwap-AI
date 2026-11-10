import { Button } from './Button';
import type { ConfirmedBooking } from '../data/booking';
import { hasAssignedMeeting, meetingPlatformLabel, openMeeting } from '../data/meeting';

/** Misma validación y apertura que las sesiones; sin enlaces ejecutables desde datos sin validar. */
export function MeetingLink({ session }: { session: ConfirmedBooking }) {
  if (!hasAssignedMeeting(session)) return <span>Enlace pendiente</span>;
  return <div className="min-w-0 text-sm">
    <p className="font-semibold">{meetingPlatformLabel(session.meetingPlatform)}</p>
    <p className="break-all">{session.meetingUrl}</p>
    {['upcoming', 'active'].includes(session.status) && <Button size="sm" variant="outline" className="mt-2" onClick={() => { openMeeting(session); }}>Abrir enlace de reunión</Button>}
  </div>;
}
