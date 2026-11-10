import { BookingError, type BookingLedger } from './booking';

export type MeetingPlatform = 'google_meet' | 'zoom' | 'webex' | null;
export const MEETING_PLATFORMS: Record<Exclude<MeetingPlatform, null>, { label: string; hosts: string[] }> = {
  google_meet: { label: 'Google Meet', hosts: ['meet.google.com'] },
  zoom: { label: 'Zoom', hosts: ['zoom.us'] },
  webex: { label: 'Cisco Webex', hosts: ['webex.com'] },
};
type MeetingDetails = { meetingPlatform?: MeetingPlatform; meetingUrl?: string | null };
export function meetingPlatformLabel(platform?: MeetingPlatform): string {
  return platform && Object.hasOwn(MEETING_PLATFORMS, platform) ? MEETING_PLATFORMS[platform].label : 'Sin plataforma asignada';
}

/** meeting.ts de Make: HTTPS y dominio exacto o subdominio de la plataforma.
 * Se rechazan también credenciales incrustadas y caracteres de control/espacios internos.
 */
export function isValidMeetingUrl(platform: MeetingPlatform | undefined, value?: string | null): boolean {
  if (!platform || !Object.hasOwn(MEETING_PLATFORMS, platform) || typeof value !== 'string' || !value.trim() || value.trim().length > 2048) return false;
  const clean = value.trim();
  if (/\s|\\/u.test(clean) || [...clean].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return false;
  try {
    const url = new URL(clean);
    return url.protocol === 'https:' && !url.username && !url.password
      && MEETING_PLATFORMS[platform].hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}
export const hasAssignedMeeting = (session: MeetingDetails): boolean => isValidMeetingUrl(session.meetingPlatform, session.meetingUrl);

/** Se valida de nuevo al abrir; el almacenamiento del navegador no es una fuente confiable. */
export function openMeeting(session: MeetingDetails & { status: string }): boolean {
  if (!['upcoming', 'active'].includes(session.status) || !hasAssignedMeeting(session)) return false;
  window.open(session.meetingUrl!.trim(), '_blank', 'noopener,noreferrer');
  return true;
}

/** La capa de servicio comprueba identidad, aprobación y cuenta activa antes de llamar. */
export function assignMeetingToSession(state: BookingLedger, input: {
  sessionId: string; mentorId: string; platform: Exclude<MeetingPlatform, null>; url: string; assignedAt: string;
}): BookingLedger {
  const session = state.sessions.find(item => item.id === input.sessionId);
  if (!session || session.mentorId !== input.mentorId || !['upcoming', 'active'].includes(session.status)) throw new BookingError('invalid_transition', 'Solo puedes asignar enlaces a tus sesiones próximas o en curso.');
  if (!isValidMeetingUrl(input.platform, input.url)) throw new BookingError('invalid_meeting_url', 'Usa una URL HTTPS válida del dominio correspondiente a la plataforma, sin credenciales, de hasta 2048 caracteres.');
  const url = input.url.trim();
  if (session.meetingPlatform === input.platform && session.meetingUrl === url) return state;
  const id = crypto.randomUUID();
  const updated = Boolean(session.meetingUrl);
  return {
    ...state,
    sessions: state.sessions.map(item => item.id === session.id ? { ...item, meetingPlatform: input.platform, meetingUrl: url, meetingAssignedAt: input.assignedAt,
      history: [...(item.history ?? [{ id: `${item.id}:booked`, at: item.createdAt, label: 'Reserva confirmada', actor: 'system' as const }]), { id: `${item.id}:meeting:${id}`, at: input.assignedAt, label: updated ? 'Enlace de sesión actualizado' : 'Enlace de sesión asignado', actor: 'mentor' as const }],
    } : item),
    notifications: [{ id: `NOT-${session.id}-meeting-link-${id}`, userId: session.studentId,
      title: updated ? 'Enlace de sesión actualizado' : 'Enlace de sesión disponible',
      description: `${meetingPlatformLabel(input.platform)} ya está disponible para tu sesión de ${session.skill}.`, date: 'Ahora', read: false, target: 'sessions', sessionId: session.id,
    }, ...state.notifications],
  };
}
