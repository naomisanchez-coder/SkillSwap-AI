import { useRef, useState, type FormEvent } from 'react';
import { Button } from './ui';
import type { ConfirmedBooking } from '../data/booking';
import { hasAssignedMeeting, isValidMeetingUrl, MEETING_PLATFORMS, type MeetingPlatform } from '../data/meeting';

/** Formulario de enlace virtual del detalle de SessionsHubPage de Figma Make. */
export function SessionMeetingEditor({ session, busy, onSave }: {
  session: ConfirmedBooking; busy: boolean;
  onSave: (platform: Exclude<MeetingPlatform, null>, url: string) => Promise<void>;
}) {
  const [platform, setPlatform] = useState<Exclude<MeetingPlatform, null>>(session.meetingPlatform && Object.hasOwn(MEETING_PLATFORMS, session.meetingPlatform) ? session.meetingPlatform : 'google_meet');
  const [url, setUrl] = useState(session.meetingUrl ?? '');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!isValidMeetingUrl(platform, url)) {
      setError('Usa una URL HTTPS válida del dominio correspondiente a la plataforma, sin credenciales, de hasta 2048 caracteres.');
      input.current?.focus(); return;
    }
    setError(''); void onSave(platform, url.trim());
  };
  return <form onSubmit={submit} noValidate aria-busy={busy} className="mt-5 rounded-xl border border-[#E2E8E0] p-4">
    <p className="font-bold">Enlace virtual</p>
    <p className="mt-1 text-xs text-[#60716C]">Asigna o actualiza un enlace HTTPS de Google Meet, Zoom o Cisco Webex.</p>
    <fieldset disabled={busy} className="min-w-0">
      <legend className="sr-only">Asignación del enlace externo</legend>
      <label className="block mt-3 text-sm font-medium" htmlFor="meeting-platform">Plataforma</label>
      <select id="meeting-platform" value={platform} onChange={event => { setPlatform(event.target.value as Exclude<MeetingPlatform, null>); setError(''); }} className="mt-1.5 w-full h-10 rounded-xl border border-[#CBD8CE] bg-white px-3 text-sm">
        {Object.entries(MEETING_PLATFORMS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
      </select>
      <label className="block mt-3 text-sm font-medium" htmlFor="meeting-url">URL HTTPS</label>
      <input ref={input} id="meeting-url" type="url" value={url} onChange={event => { setUrl(event.target.value); setError(''); }} placeholder="https://" autoComplete="off" maxLength={2048} aria-invalid={Boolean(error)} aria-describedby={error ? 'meeting-url-error' : undefined} className="mt-1.5 w-full h-10 rounded-xl border border-[#CBD8CE] px-3 text-sm" />
      {error && <p id="meeting-url-error" className="mt-2 text-xs text-[#B54747]" role="alert">{error}</p>}
      <Button type="submit" full disabled={busy} className="mt-3">{busy ? 'Guardando…' : hasAssignedMeeting(session) ? 'Actualizar enlace' : 'Asignar enlace'}</Button>
    </fieldset>
  </form>;
}
