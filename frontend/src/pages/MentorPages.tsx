import { useEffect, useRef } from 'react';
import { Badge, Button, Card, Stars } from '../components/ui';
import { Icons } from '../components/icons';
import { formatSessionDate, formatSessionSchedule } from '../data/scheduling';
import type { MentorWorkspace } from '../data/mentor';

function usePageHeading() { const heading = useRef<HTMLHeadingElement>(null); useEffect(() => { heading.current?.focus(); }, []); return heading; }
// La asignación de enlaces externos conserva el destino pendiente del incremento anterior.
const hasAssignedMeeting = (session: { meetingUrl: null }) => Boolean(session.meetingUrl);
const meetingPlatformLabel = (platform: null) => platform ?? 'Enlace pendiente';

export function MentorDashboardPage({ workspace: state, onAvailability, onEarnings, onStudentMode }: { workspace: MentorWorkspace; onAvailability: () => void; onEarnings: () => void; onStudentMode: () => void }) {
  const heading = usePageHeading();
  const mentorSessions = state.sessions;
  const completed = mentorSessions.filter(item => item.status === 'completed');
  const reviews = state.reviews;
  const averageRating = reviews.length
    ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length) * 10) / 10
    : 0;
  const supportHours = completed.reduce((sum, session) => sum + session.duration, 0) / 60;
  return (
    <main className="min-h-screen bg-[#F7F7F2] p-4 md:p-8 text-[#182B2A]">
      <div className="max-w-[1180px] mx-auto">
        <section className="rounded-[24px] bg-[#DCEBDD] border border-[#C9D8CC] p-5 sm:p-7 md:p-9 flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><Badge variant="primary">Modo mentor</Badge><h1 ref={heading} tabIndex={-1} className="mt-3 text-3xl md:text-4xl font-extrabold">Mi panel de mentor</h1><p className="mt-2 text-[#52645F]">Organiza tus mentorías y revisa tu participación académica.</p></div><Button variant="outline" onClick={onStudentMode}>Volver al modo estudiante</Button></section>
        <section className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-8">
          {[['Sesiones próximas', mentorSessions.filter(item => ['upcoming', 'active', 'validation'].includes(item.status)).length], ['Sesiones completadas', completed.length], ['Horas de apoyo', supportHours.toLocaleString('es-PE', { maximumFractionDigits: 1 })], ['Créditos académicos', completed.reduce((sum, item) => sum + item.credits, 0)], ['Promedio', reviews.length ? averageRating.toFixed(1) : 'Aún sin valoraciones'], ['Reseñas recibidas', reviews.length]].map(([label, value]) => <Card key={String(label)} className="p-5"><p className="text-3xl font-bold text-[#24685F]">{String(value)}</p><p className="text-sm text-[#64748B] mt-1">{String(label)}</p></Card>)}
        </section>
        <div className="grid lg:grid-cols-[1fr_320px] gap-6 mt-8">
          <Card className="p-6"><p className="text-xl font-bold text-[#111827]">Próximas mentorías</p>{mentorSessions.filter(item => item.status === 'upcoming').length === 0 ? <div className="mt-5 py-12 text-center border border-dashed border-[#CBD5E1] rounded-xl"><p className="font-semibold text-[#111827]">No hay nuevas reservas como mentor</p><p className="text-sm text-[#64748B] mt-1">Las reservas recibidas aparecerán aquí con el estado del enlace externo.</p></div> : <div className="mt-5 space-y-3">{mentorSessions.filter(item => item.status === 'upcoming').map(item => <div key={item.id} className="p-4 rounded-xl bg-[#F8FAFC] break-words"><p className="font-semibold text-[#111827]">{item.learnerName} · {item.skill}</p><p className="text-sm text-[#64748B] mt-1">{formatSessionSchedule(item.date, item.time)} · {item.duration} min · Virtual</p><p className="mt-2 text-xs text-[#60716C]">{hasAssignedMeeting(item) ? meetingPlatformLabel(item.meetingPlatform) : 'Enlace pendiente'}</p><Button className="mt-3" size="sm" disabled={!hasAssignedMeeting(item)} onClick={() => { if (item.meetingUrl) window.open(item.meetingUrl, '_blank', 'noopener,noreferrer'); }}>{hasAssignedMeeting(item) ? 'Abrir sesión' : 'Enlace pendiente'}</Button></div>)}</div>}</Card>
          <div className="space-y-4"><Button full size="lg" onClick={onAvailability}>Administrar disponibilidad</Button><Button full size="lg" variant="outline" onClick={onEarnings}>Ver créditos ganados</Button></div>
        </div>
      </div>
    </main>
  );
}


export function MentorReviewsPage({ workspace: state }: { workspace: MentorWorkspace }) {
  const heading = usePageHeading();
  const reviews = state.reviews.filter(review =>
    state.sessions.some(session => session.id === review.sessionId && session.status === 'completed'),
  );
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  return (
    <main className="max-w-[1040px] mx-auto px-4 md:px-8 py-8 md:py-12 text-[#182B2A]">
      <section className="rounded-[24px] bg-[#DCEBDD] border border-[#C9D8CC] p-5 sm:p-7 md:p-9"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#24685F]">Retroalimentación</p><h1 ref={heading} tabIndex={-1} className="mt-2 text-3xl md:text-4xl font-extrabold">Mis valoraciones</h1><p className="mt-2 text-[#52645F]">Solo se incluyen reseñas de sesiones completadas y validadas.</p></section>
      <div className="grid md:grid-cols-[280px_1fr] gap-6 mt-7">
        <Card className="p-6 h-fit"><p className="text-4xl font-extrabold text-[#24685F]">{reviews.length ? average.toFixed(1) : '—'}</p><p className="mt-1 text-sm text-[#64748B]">{reviews.length ? `${reviews.length} reseñas recibidas` : 'Aún sin valoraciones'}</p><div className="mt-5 space-y-2">{[5,4,3,2,1].map(star => <div key={star} className="flex items-center gap-2 text-xs"><span className="w-8">{star} ★</span><div className="h-2 flex-1 rounded-full bg-[#E2E8E0] overflow-hidden"><div className="h-full bg-[#D89019]" style={{ width: `${reviews.length ? (reviews.filter(review => review.rating === star).length / reviews.length) * 100 : 0}%` }} /></div><span className="w-5 text-right">{reviews.filter(review => review.rating === star).length}</span></div>)}</div></Card>
        <div className="space-y-3">{reviews.length === 0 ? <Card className="p-8 text-center"><p className="font-bold">Aún sin valoraciones</p></Card> : reviews.map(review => <Card key={review.id} className="p-5"><div className="flex items-center justify-between gap-3"><Stars rating={review.rating} /><time className="text-xs text-[#64748B]" dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString('es-PE', { timeZone: 'America/Lima' })}</time></div><p className="mt-3 text-sm font-semibold">{review.topic || review.skill || 'Mentoría académica'}</p><p className="mt-2 text-sm leading-6 text-[#60716C]">{review.comment || 'El estudiante no agregó un comentario.'}</p><p className="mt-3 text-xs text-[#94A3B8]">Sesión {review.sessionId}</p></Card>)}</div>
      </div>
    </main>
  );
}


export function MentorEarningsPage({ workspace: state, onBack }: { workspace: MentorWorkspace; onBack: () => void }) {
  const heading = usePageHeading();
  const completed = state.sessions.filter(item => item.status === 'completed');
  const mentorShare = completed.reduce((sum, item) => sum + item.credits, 0);
  const supportHours = completed.reduce((sum, session) => sum + session.duration, 0) / 60;
  const taughtSkills = Array.from(new Set(completed.map(session => session.skill)));
  const pendingShare = Math.round(state.sessions
    .filter(item => ['upcoming', 'active', 'validation', 'review'].includes(item.status))
    .reduce((total, item) => total + item.credits, 0) * 10) / 10;
  return (
    <main className="min-h-screen bg-[#F8FAFC] p-4 md:p-8">
      <div className="max-w-[1000px] mx-auto">
        <Button variant="ghost" onClick={onBack} icon={<Icons.ChevLeft s={15} />}>Panel mentor</Button>
        <p className="mt-6 text-sm font-semibold text-[#24685F]">RECONOCIMIENTO ACADÉMICO</p>
        <h1 ref={heading} tabIndex={-1} className="mt-2 text-3xl font-bold text-[#111827]">Historial de participación</h1>
        <p className="mt-2 text-[#64748B]">El mentor recibe el 100 % de los créditos académicos de cada sesión completada y validada.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          <Card className="p-5"><p className="text-3xl font-bold text-[#24685F]">{completed.length}</p><p className="text-sm text-[#64748B] mt-1">Sesiones impartidas</p></Card>
          <Card className="p-5"><p className="text-3xl font-bold text-[#24685F]">{supportHours.toLocaleString('es-PE', { maximumFractionDigits: 1 })}</p><p className="text-sm text-[#64748B] mt-1">Horas acumuladas</p></Card>
          <Card className="p-5"><p className="text-3xl font-bold text-[#24685F]">{taughtSkills.length}</p><p className="text-sm text-[#64748B] mt-1">Habilidades enseñadas</p></Card>
          <Card className="p-5"><p className="text-3xl font-bold text-[#16A34A]">{mentorShare}</p><p className="text-sm text-[#64748B] mt-1">Créditos académicos</p></Card>
        </div>
        {pendingShare > 0 && <p className="mt-4 text-sm text-[#6B5836]">{pendingShare} créditos permanecen retenidos en sesiones programadas, realizadas o con incidencia.</p>}
        <Card className="mt-6 p-6"><p className="text-xl font-bold text-[#111827]">Historial de mentorías</p>{completed.length === 0 ? <p className="mt-5 text-sm text-[#64748B]">Todavía no tienes mentorías completadas. Los créditos aparecerán después de validar una sesión.</p> : <div className="mt-5 space-y-3">{completed.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-[#F8FAFC] break-all"><div><p className="font-semibold text-[#111827]">{item.skill}</p><p className="text-xs text-[#64748B] mt-1">{formatSessionDate(item.date)} · {item.id}</p></div><Badge variant="success">+{item.credits} cr</Badge></div>)}</div>}</Card>
        <Card className="mt-6 p-5 bg-[#FFF4D6] border-[#F3E4B9]"><p className="text-sm leading-6 text-[#6B5836]">Tu historial registra tu participación como mentor dentro de SkillSwap AI. No constituye una certificación oficial de TECSUP</p></Card>
      </div>
    </main>
  );
}
