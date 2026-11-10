import { useEffect, useRef, useState } from 'react';
import { Avatar, Badge, Button } from '../components/ui';
import { EmptyState } from '../components/StudentUI';
import { SessionModal } from '../components/SessionModal';
import { Icons } from '../components/icons';
import type { BookingLedger, ConfirmedBooking, IncidentCategory } from '../data/booking';
import { BookingError } from '../data/booking';
import { isOpenIncident } from '../data/admin';
import { canCancelSession, type SessionAction } from '../data/sessionLifecycle';
import { formatSessionSchedule } from '../data/scheduling';
import type { StudentService } from '../services/student';
import { sessionMentorOwner, type MentorSessionAction } from '../data/mentor';
import { hasAssignedMeeting, meetingPlatformLabel, openMeeting } from '../data/meeting';
import { SessionMeetingEditor } from '../components/SessionMeetingEditor';

const tabs = [['upcoming', 'Próximas'], ['active', 'En curso'], ['validation', 'Por validar'], ['completed', 'Completadas'], ['cancelled', 'Canceladas'], ['review', 'En revisión']] as const;
type SessionStatus = ConfirmedBooking['status'];
const confirmationLabel = (timestamp?: string) => timestamp ? `Confirmada el ${new Date(timestamp).toLocaleString('es-PE', { timeZone: 'America/Lima' })}` : 'Sin confirmación registrada';
type Dialog = { type: 'detail' | 'cancel' | 'validate' | 'report' | 'rate' | 'perform'; id: string };

/** Vista estudiantil adaptada de SessionsHubPage.tsx de Figma Make. */
export default function SessionsHubPage({ ledger, service, onChanged, onExplore, mentorAction, initialSessionId }: { ledger: BookingLedger; service: StudentService; onChanged: (ledger: BookingLedger) => void; onExplore: () => void; mentorAction?: (action: MentorSessionAction) => Promise<BookingLedger>; initialSessionId?: string }) {
  const initialSession = ledger.sessions.find(session => session.id === initialSessionId && (mentorAction ? sessionMentorOwner(session) === ledger.studentId : session.studentId === ledger.studentId));
  const [tab, setTab] = useState<SessionStatus>(initialSession?.status ?? 'upcoming');
  const [dialog, setDialog] = useState<Dialog | null>(initialSession ? { type: 'detail', id: initialSession.id } : null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState<IncidentCategory>('connection');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { heading.current?.focus(); const timer = window.setInterval(() => setClock(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const ownSessions = ledger.sessions.filter(session => mentorAction ? sessionMentorOwner(session) === ledger.studentId : session.studentId === ledger.studentId);
  const filtered = ownSessions.filter(session => session.status === tab);
  const selected = ownSessions.find(session => session.id === dialog?.id);
  const open = (type: Dialog['type'], id: string) => { setError(''); setReason(''); setCategory('connection'); setRating(0); setComment(''); setDialog({ type, id }); };
  const close = () => { if (!inFlight.current) { setDialog(null); setError(''); if (initialSessionId) requestAnimationFrame(() => heading.current?.focus()); } };
  const submit = async (action: SessionAction | MentorSessionAction) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const next = mentorAction ? await mentorAction(action as MentorSessionAction) : await service.updateSession(action as SessionAction);
      onChanged(next); setDialog(null);
      setMessage(action.type === 'meeting' ? 'Enlace de sesión guardado.' : action.type === 'cancel' ? 'Reserva cancelada y créditos devueltos.' : action.type === 'validate' ? 'Sesión completada. Créditos liberados al mentor.' : action.type === 'report' ? 'Incidencia enviada. Los créditos siguen retenidos.' : action.type === 'start' ? 'Sesión iniciada.' : action.type === 'perform' ? 'Mentoría marcada como realizada. Pendiente de confirmación del estudiante; los créditos siguen retenidos.' : 'Valoración enviada.');
      if (action.type !== 'meeting') setTab(action.type === 'cancel' ? 'cancelled' : action.type === 'report' ? 'review' : action.type === 'start' ? 'active' : action.type === 'perform' ? 'validation' : 'completed');
      requestAnimationFrame(() => heading.current?.focus());
    } catch (caught) { setError(caught instanceof BookingError ? caught.message : 'No pudimos guardar el cambio. Vuelve a intentarlo.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const join = (session: ConfirmedBooking) => { if (!openMeeting(session)) setError('El enlace no está disponible o no es válido. Vuelve a consultar la sesión.'); };
  const confirmations = (session: ConfirmedBooking) => <div className="mt-2 space-y-1 text-xs text-[#52645F]"><p><strong>Confirmación del mentor</strong> · {confirmationLabel(session.performedAt)}</p><p><strong>Confirmación del estudiante</strong> · {confirmationLabel(session.validatedAt)}</p>{session.adminResolution && <p className="font-semibold">Créditos liberados por resolución administrativa el {new Date(session.adminResolution.at).toLocaleString('es-PE', { timeZone: 'America/Lima' })}.</p>}</div>;
  return <main className="max-w-[1080px] mx-auto px-4 md:px-8 py-8 md:py-12 text-[#182B2A]">
    <section className="rounded-[24px] bg-[#DCEBDD] border border-[#C9D8CC] p-5 sm:p-7 md:p-9">
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#24685F]">{mentorAction ? 'Mentorías asignadas' : 'Tu aprendizaje'}</p>
      <h1 ref={heading} tabIndex={-1} className="mt-3 text-3xl md:text-4xl font-extrabold">Mis sesiones</h1>
      <p className="mt-3 text-[#52645F]">{mentorAction ? 'Consulta tus estudiantes, sesiones e incidencias. Horarios mostrados en America/Lima.' : 'Revisa tus reservas y sesiones anteriores. Horarios mostrados en America/Lima.'}</p>
    </section>
    <p role="status" className="mt-4 text-sm font-semibold text-[#24685F]">{message}</p>
    {error && !dialog && <p role="alert" className="mt-3 text-sm text-[#B54747]">{error}</p>}
    <div ref={tabsRef} role="tablist" aria-label="Estados de sesiones" className="mt-6 flex gap-2 overflow-x-auto pb-2" onKeyDown={event => {
      const index = tabs.findIndex(([key]) => key === tab);
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault(); setTab(tabs[next][0]); tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next].focus();
    }}>
      {tabs.map(([key, label]) => <button id={`session-tab-${key}`} aria-controls="session-list" role="tab" aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} type="button" key={key} onClick={() => setTab(key)} className={`shrink-0 min-h-11 rounded-full px-4 text-sm font-bold border ${tab === key ? 'bg-[#24685F] text-white border-[#24685F]' : 'bg-white text-[#52645F] border-[#CBD8CE]'}`}>{label} <span className="ml-1 opacity-75">{ownSessions.filter(session => session.status === key).length}</span></button>)}
    </div>
    <div id="session-list" role="tabpanel" aria-labelledby={`session-tab-${tab}`} tabIndex={0} className="mt-4 space-y-4">
      {!filtered.length ? <EmptyState icon={<Icons.Calendar s={28} />} title="No tienes sesiones en este estado" description="Cuando haya actividad aparecerá aquí con sus detalles y acciones disponibles." action={tab === 'upcoming' ? (mentorAction ? 'Volver al panel' : 'Explorar mentores') : undefined} onAction={onExplore} /> : filtered.map(session => {
        const incident = ledger.incidents.find(item => item.sessionId === session.id && isOpenIncident(item));
        return <article key={session.id} data-session-id={session.id} className="rounded-[20px] border border-[#E2E8E0] bg-white p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <Avatar name={mentorAction ? session.learnerName : session.mentorName} size="lg" />
            <div className="flex-1 min-w-0 break-words">
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">{mentorAction ? session.learnerName : session.mentorName}</h2><Badge variant={session.status === 'completed' ? 'success' : session.status === 'cancelled' ? 'danger' : session.status === 'review' ? 'warning' : 'primary'}>{tabs.find(([key]) => key === session.status)?.[1]}</Badge></div>
              <p className="mt-1 text-sm font-semibold text-[#24685F]">{session.skill} · {session.topic}</p>
              <p className="mt-2 text-sm text-[#60716C]">{formatSessionSchedule(session.date, session.time)} · {session.duration} min · {session.credits} créditos</p>
              <p className="mt-2 text-xs font-semibold text-[#52645F]">Mentoría virtual · {hasAssignedMeeting(session) ? meetingPlatformLabel(session.meetingPlatform) : 'Enlace pendiente'}</p>
              {confirmations(session)}
              {!mentorAction && session.status === 'upcoming' && <p className="mt-2 text-xs text-[#60716C]">{canCancelSession(session, new Date(clock)) ? 'Cancelación disponible con devolución: mínimo 12 horas de anticipación.' : 'Cancelación no disponible: se requiere un mínimo de 12 horas de anticipación.'}</p>}
              {session.status === 'cancelled' && <p className="mt-2 text-sm text-[#B54747]">{session.cancellationReason} · {session.refundStatus}</p>}
              {incident && <p className="mt-2 text-sm text-[#92400E]">Pendiente de revisión administrativa: {incident.reason}. Créditos retenidos.</p>}
              {session.rated && <p className="mt-2 text-sm text-[#24685F]">Reseña enviada · {session.rating}/5 estrellas</p>}
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-60">
              <Button variant="outline" onClick={() => open('detail', session.id)}>Ver detalle</Button>
              {['upcoming', 'active'].includes(session.status) && <Button disabled={!hasAssignedMeeting(session)} onClick={() => join(session)}>{hasAssignedMeeting(session) ? 'Unirse a la sesión' : 'Enlace pendiente'}</Button>}
              {!mentorAction && session.status === 'upcoming' && <Button variant="outline" disabled={!canCancelSession(session, new Date(clock))} onClick={() => open('cancel', session.id)}>Cancelar</Button>}
              {!mentorAction && session.status === 'validation' && <Button onClick={() => open('validate', session.id)}>Validar sesión</Button>}
              {mentorAction && session.status === 'upcoming' && <Button disabled={busy} variant="secondary" onClick={() => void submit({ type: 'start', sessionId: session.id })}>Iniciar sesión</Button>}
              {mentorAction && session.status === 'active' && <Button onClick={() => open('perform', session.id)}>Marcar realizada</Button>}
              {['upcoming', 'active', 'validation'].includes(session.status) && <Button variant="ghost" onClick={() => open('report', session.id)}>Reportar incidencia</Button>}
              {!mentorAction && session.status === 'completed' && !session.rated && <Button onClick={() => open('rate', session.id)}>Valorar mentor</Button>}
            </div>
          </div>
        </article>;
      })}
    </div>
    {selected && dialog && <SessionModal busy={busy} title={dialog.type === 'detail' ? 'Detalle de sesión' : dialog.type === 'cancel' ? '¿Cancelar esta reserva?' : dialog.type === 'validate' ? 'Confirmar sesión realizada' : dialog.type === 'report' ? 'Reportar incidencia' : dialog.type === 'perform' ? 'Confirmar mentoría realizada' : '¿Cómo fue tu experiencia?'} onClose={close} description={dialog.type === 'detail' ? selected.id : undefined}>
      {dialog.type === 'detail' && <>
        <dl className="space-y-3 text-sm break-words">{[
          ['Participantes', `${selected.learnerName} y ${selected.mentorName}`], ['Habilidad', selected.skill], ['Tema', selected.topic], ['Fecha y hora', formatSessionSchedule(selected.date, selected.time)], ['Duración', `${selected.duration} minutos`], ['Créditos', selected.credits], ['Estado', tabs.find(([key]) => key === selected.status)?.[1]], ['Modalidad', 'Virtual'], ['Plataforma', hasAssignedMeeting(selected) ? meetingPlatformLabel(selected.meetingPlatform) : 'Sin plataforma asignada'], ['Enlace', hasAssignedMeeting(selected) ? selected.meetingUrl : 'Enlace pendiente'],
        ].map(([label, value]) => <div key={label}><dt className="font-bold">{label}</dt><dd>{value}</dd></div>)}</dl>
        {confirmations(selected)}
        <p className="mt-5 rounded-xl bg-[#F7F7F2] p-4 text-xs leading-5 text-[#60716C]">SkillSwap no incorpora videollamada propia. El enlace externo solo se habilita cuando existe uno asignado.</p>
        {['upcoming', 'active'].includes(selected.status) && <Button full className="mt-5" disabled={!hasAssignedMeeting(selected)} onClick={() => join(selected)}>{hasAssignedMeeting(selected) ? 'Unirse a la sesión' : 'Enlace pendiente'}</Button>}
        {mentorAction && ['upcoming', 'active'].includes(selected.status) && <SessionMeetingEditor key={selected.id} session={selected} busy={busy} onSave={(platform, url) => submit({ type: 'meeting', sessionId: selected.id, platform, url })} />}
        <h3 className="mt-5 font-bold">Historial de la sesión</h3>
        <ol className="mt-3 space-y-3 text-sm">{(selected.history ?? [{ id: `${selected.id}:booked`, at: selected.createdAt, label: 'Reserva confirmada', actor: 'system' }]).map(item => <li key={item.id}><p>{item.label}</p><time className="text-xs text-[#60716C]" dateTime={item.at}>{new Date(item.at).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</time></li>)}</ol>
        {ledger.incidents.filter(item => item.sessionId === selected.id).map(item => <div key={item.id} className="mt-4 rounded-xl bg-[#FFF4D6] p-3 text-sm break-words"><p className="font-semibold">{item.status === 'resolved' ? 'Incidencia resuelta' : item.status === 'closed' ? 'Incidencia cerrada' : 'Pendiente de revisión administrativa'}</p><p>{item.reason}</p>{item.resolutionComment && <p className="mt-2">Resolución: {item.resolutionComment} · {item.resolvedBy}</p>}<p className="mt-1 text-xs">{item.id}</p></div>)}
        {!mentorAction && selected.status === 'upcoming' && <p className="mt-5 rounded-xl bg-[#F7F7F2] p-4 text-sm">Puedes cancelar con devolución hasta 12 horas antes de la sesión. Pasado ese plazo, puedes reportar una incidencia.</p>}
      </>}
      {dialog.type === 'cancel' && <><p className="text-sm leading-6 text-[#60716C]">Se cancelará la sesión de {selected.skill} con {selected.mentorName}. Puedes cancelar reservas próximas con al menos 12 horas de anticipación. Los {selected.credits} créditos retenidos se devolverán una sola vez a tu saldo disponible.</p><div className="mt-6 flex flex-col-reverse sm:flex-row justify-end gap-2"><Button disabled={busy} variant="outline" onClick={close}>Conservar reserva</Button><Button disabled={busy} onClick={() => void submit({ type: 'cancel', sessionId: selected.id })}>{busy ? 'Guardando…' : 'Confirmar cancelación'}</Button></div></>}
      {dialog.type === 'validate' && <><p className="text-sm leading-6">El mentor confirmó la realización. Confirma solo si la sesión se realizó: se liberarán {selected.credits} créditos al mentor. Si no estás de acuerdo, cierra este diálogo y reporta una incidencia.</p>{confirmations(selected)}<Button full disabled={busy} className="mt-5" onClick={() => void submit({ type: 'validate', sessionId: selected.id })}>{busy ? 'Guardando…' : 'Confirmar y liberar créditos'}</Button></>}
      {dialog.type === 'perform' && <><p className="text-sm leading-6">Confirma que realizaste esta mentoría. Los {selected.credits} créditos seguirán retenidos hasta que el estudiante confirme que la sesión se realizó.</p><Button full disabled={busy} className="mt-5" onClick={() => void submit({ type: 'perform', sessionId: selected.id })}>{busy ? 'Guardando…' : 'Confirmar mentoría realizada'}</Button></>}
      {dialog.type === 'report' && <form onSubmit={event => { event.preventDefault(); void submit({ type: 'report', sessionId: selected.id, category, reason }); }}>
        <p className="mb-4 text-sm leading-6 text-[#60716C]">Los créditos permanecerán retenidos hasta la revisión administrativa.</p>
        <label htmlFor="incident-category" className="text-sm font-semibold">Tipo de problema</label><select id="incident-category" value={category} disabled={busy} onChange={event => setCategory(event.target.value as IncidentCategory)} className="mt-2 w-full h-11 rounded-xl border border-[#CBD8CE] bg-white px-3 text-sm">{[[mentorAction ? 'student_absent' : 'mentor_absent', mentorAction ? 'Estudiante ausente' : 'Mentor ausente'], ['connection', 'Problemas de conexión'], ['not_held', 'Sesión no realizada'], ['completion_dispute', 'Desacuerdo sobre finalización'], ['other', 'Otro problema relacionado']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <label htmlFor="incident-reason" className="block mt-4 text-sm font-semibold">Describe lo ocurrido</label><textarea id="incident-reason" required maxLength={1000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-[#CBD8CE] p-3 text-sm" />
        <Button type="submit" full className="mt-5" disabled={busy || !reason.trim()}>{busy ? 'Guardando…' : 'Enviar reporte'}</Button>
      </form>}
      {dialog.type === 'rate' && <form onSubmit={event => { event.preventDefault(); void submit({ type: 'rate', sessionId: selected.id, rating, comment }); }}>
        <fieldset disabled={busy}><legend className="text-sm font-semibold">Valoración de la sesión con {selected.mentorName}</legend><div className="mt-3 flex justify-center gap-1">{[1, 2, 3, 4, 5].map(value => <label key={value} className="relative flex min-h-11 min-w-11 cursor-pointer items-center justify-center"><input className="peer sr-only" type="radio" name="rating" value={value} checked={rating === value} required onChange={() => setRating(value)} aria-label={`${value} ${value === 1 ? 'estrella' : 'estrellas'}`} /><span aria-hidden="true" className={`text-4xl rounded peer-focus-visible:outline-2 peer-focus-visible:outline-[#24685F] ${value <= rating ? 'text-[#D89019]' : 'text-[#CBD5E1]'}`}>★</span></label>)}</div></fieldset>
        <label htmlFor="rating-comment" className="block mt-5 text-sm font-semibold">Comentario opcional</label><textarea id="rating-comment" maxLength={500} disabled={busy} value={comment} onChange={event => setComment(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-[#CBD8CE] p-3 text-sm" /><p className="mt-1 text-right text-xs text-[#60716C]">{comment.length}/500</p><Button full type="submit" className="mt-5" disabled={busy || !rating}>{busy ? 'Guardando…' : 'Enviar reseña'}</Button>
      </form>}
      {error && <p role="alert" className="mt-4 text-sm text-[#B54747]">{error}</p>}
    </SessionModal>}
  </main>;
}
