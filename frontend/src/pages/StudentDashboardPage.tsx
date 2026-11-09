import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button } from '../components/ui';
import { Icons } from '../components/icons';
import { EmptyState, MentorCard, StatCard } from '../components/StudentUI';
import type { StudentDashboardData } from '../data/student';
import { hasCompletePreferences } from '../data/student';
import type { Mentor } from '../data/mentors';
import { preferencesFromProfile, recommendMentors } from '../data/recommendations';
import { formatSessionSchedule, parseTime } from '../data/scheduling';
import { RecommendationAssistant } from '../components/RecommendationAssistant';
import { homeSecondaryPhoto } from '../data/publicContent';

function sessionTimestamp(date: string, time: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Number.POSITIVE_INFINITY;
  const minutes = parseTime(time);
  if (!Number.isFinite(minutes)) return Number.POSITIVE_INFINITY;
  const value = new Date(`${date}T00:00:00-05:00`);
  return value.getTime() + minutes * 60_000;
}

export default function StudentDashboardPage({
  state,
  mentors,
  onExplore,
  onDiscover,
  onSessions,
  onWallet,
  onMentorRequest,
  onMentorMode,
  onMentor,
  onEditPreferences,
}: {
  state: StudentDashboardData;
  mentors: Mentor[];
  onExplore: () => void;
  onDiscover: () => void;
  onSessions: () => void;
  onWallet: () => void;
  onMentorRequest: () => void;
  onMentorMode?: () => void;
  onMentor: (id: string) => void;
  onEditPreferences: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  const [assistantRequest, setAssistantRequest] = useState<{ skill?: string; key: number }>({ key: 0 });
  const studentSessions = state.sessions.filter(session => session.studentId === state.profile.id);
  const nextSession = [...studentSessions]
    .filter(session => session.status === 'upcoming')
    .sort((a, b) => sessionTimestamp(a.date, a.time) - sessionTimestamp(b.date, b.time))[0];
  const approved = state.skillRequests.filter(request => request.ownerUserId === state.profile.id && request.status === 'approved');
  const completedSessions = studentSessions.filter(item => item.status === 'completed');
  const learningHours = completedSessions.reduce((total, item) => total + item.duration, 0) / 60;
  const exploredSkills = Array.from(new Set([
    ...state.profile.interests,
    ...completedSessions.map(item => item.skill),
  ]));
  const preferencesIncomplete = !hasCompletePreferences(state.profile);
  const recommendations = useMemo(() => {
    if (preferencesIncomplete) return [];
    const preferences = preferencesFromProfile(state.profile);
    return recommendMentors({
      mentors,
      preferences,
      ratings: state.mentorRatings,
      currentUserId: state.profile.id,
    }).slice(0, 3);
  }, [mentors, state.mentorRatings, state.profile, preferencesIncomplete]);
  const upcomingLabel = nextSession
    ? formatSessionSchedule(nextSession.date, nextSession.time, { day: 'numeric', month: 'short' })
    : 'Sin reservas';
  const openAssistant = (skill?: string) => setAssistantRequest(current => ({ skill, key: current.key + 1 }));

  return (
    <main className="max-w-[1240px] mx-auto px-4 md:px-8 py-8 md:py-12 text-[#182B2A]">
      <section className="rounded-[24px] bg-[#DCEBDD] border border-[#C9D8CC] overflow-hidden grid lg:grid-cols-[1.08fr_.92fr]">
        <div className="min-w-0 p-5 sm:p-7 md:p-10 lg:p-12">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#24685F]">Tu espacio de aprendizaje</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-[-0.035em]">Panel del estudiante</h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-[#52645F]">Encuentra personas que puedan ayudarte a aprender lo que te interesa.</p>
          <p className="mt-3 text-sm font-semibold text-[#24685F]">Hola, {state.profile.name.split(' ')[0] || 'estudiante'}.</p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <Button size="lg" onClick={onExplore} icon={<Icons.Zap s={16} />}>Encontrar mi mentor</Button>
            <Button size="lg" variant="outline" onClick={onDiscover}>Explorar habilidades</Button>
          </div>
        </div>
        <figure className="relative min-h-64 lg:min-h-full">
          <img src={homeSecondaryPhoto.src} srcSet={homeSecondaryPhoto.srcSet} sizes="(min-width: 1024px) 500px, 100vw" alt={homeSecondaryPhoto.alt} className="absolute inset-0 w-full h-full object-cover" />
          <figcaption className="absolute bottom-2 right-3 rounded-full bg-[#182B2A]/75 px-3 py-1 text-[10px] text-white">Foto: {homeSecondaryPhoto.credit} / Unsplash</figcaption>
        </figure>
      </section>

      <section aria-label="Resumen" className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
        <StatCard icon={<Icons.Coin s={19} />} label="Créditos disponibles" value={state.wallet.available} tone="sand" />
        <StatCard icon={<Icons.Calendar s={19} />} label="Próxima sesión" value={upcomingLabel} tone="white" />
        <StatCard icon={<Icons.Check s={19} />} label="Sesiones completadas" value={studentSessions.filter(item => item.status === 'completed').length} tone="sage" />
        <StatCard icon={<Icons.Award s={19} />} label="Habilidades aprobadas" value={approved.length} tone="peach" />
      </section>

      <section className="mt-8 rounded-[24px] border border-[#E4EBE7] bg-white p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#176B5B]">Progreso académico</p>
            <h2 className="mt-2 text-2xl font-bold">Tu recorrido de aprendizaje</h2>
            <p className="mt-2 text-sm text-[#64748B]">Resumen basado únicamente en tus sesiones y preferencias registradas.</p>
          </div>
          <Button variant="outline" onClick={onSessions}>Ver historial de mentorías</Button>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 mt-6">
          <div className="rounded-2xl bg-[#DDF6ED] p-5"><p className="text-3xl font-extrabold text-[#176B5B]">{completedSessions.length}</p><p className="mt-1 text-sm text-[#52645F]">Sesiones completadas</p></div>
          <div className="rounded-2xl bg-[#E8F4FF] p-5"><p className="text-3xl font-extrabold text-[#176B5B]">{learningHours.toLocaleString('es-PE', { maximumFractionDigits: 1 })}</p><p className="mt-1 text-sm text-[#52645F]">Horas de aprendizaje</p></div>
          <div className="rounded-2xl bg-[#FFF4D6] p-5"><p className="text-3xl font-extrabold text-[#176B5B]">{exploredSkills.length}</p><p className="mt-1 text-sm text-[#52645F]">Habilidades exploradas</p></div>
        </div>
        {exploredSkills.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{exploredSkills.map(skill => <span key={skill} className="rounded-full border border-[#E4EBE7] bg-[#FAFBF8] px-3 py-1.5 text-xs font-semibold text-[#52645F]">{skill}</span>)}</div>}
      </section>

      <section className="mt-8 rounded-[24px] bg-[#182B2A] text-white p-7 md:p-9 grid lg:grid-cols-[1fr_auto] gap-8 items-center">
        <div>
          <div className="w-11 h-11 rounded-2xl bg-[#DCEBDD] text-[#24685F] flex items-center justify-center"><Icons.ChatSparkle s={22} /></div>
          <h2 className="mt-5 text-3xl font-bold">Tu próximo aprendizaje empieza aquí</h2>
          <p className="mt-3 max-w-2xl leading-7 text-[#CFDAD5]">Cuéntanos qué quieres aprender y te ayudaremos a encontrar mentores compatibles.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              ['Python', 'Quiero aprender Python desde cero'],
              ['Excel', 'Busco apoyo con Excel'],
              ['', 'Necesito un mentor disponible los sábados'],
            ].map(([skill, label]) => (
              <button key={label} type="button" onClick={() => openAssistant(skill || undefined)} className="rounded-full border border-white/20 px-3 py-2 text-xs text-[#E5EEEA] hover:bg-white/10 focus-visible:outline-white">{label}</button>
            ))}
          </div>
        </div>
        <Button size="lg" onClick={() => openAssistant()} className="!bg-[#F2E8D7] !text-[#493D29] hover:!bg-white">Encontrar con IA</Button>
      </section>

      <div className="grid xl:grid-cols-[1fr_360px] gap-7 mt-9">
        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#24685F]">Pensado para ti</p>
              <h2 className="mt-2 text-2xl font-bold">Mentores recomendados</h2>
            </div>
            <Button variant="ghost" onClick={onExplore}>Ver todos</Button>
          </div>
          {recommendations.length ? (
            <div className="grid md:grid-cols-2 min-[1680px]:grid-cols-3 gap-4 mt-5">
              {recommendations.map(({ mentor, compatibility }) => (
                <MentorCard key={mentor.id} mentor={mentor} compatibility={compatibility} rating={state.mentorRatings[mentor.id]} onView={() => onMentor(mentor.id)} />
              ))}
            </div>
          ) : (
            <div className="mt-5"><EmptyState title={preferencesIncomplete ? "Completa tus preferencias para recibir recomendaciones" : "No encontramos mentores para tus preferencias"} description={preferencesIncomplete ? "Añade tus intereses, nivel, horario y objetivo para personalizar tu aprendizaje." : "Tus preferencias están completas. Aún no hay mentores elegibles para la habilidad seleccionada."} action="Editar mis preferencias" onAction={onEditPreferences} /></div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-[20px] border border-[#E2E8E0] bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#24685F]">Próxima sesión</p>
                <h2 className="mt-2 text-xl font-bold">Tu siguiente encuentro</h2>
              </div>
              <Icons.Calendar s={22} c="text-[#34877A]" />
            </div>
            {nextSession ? (
              <div className="mt-5">
                <p className="font-bold">{nextSession.skill} con {nextSession.mentorName}</p>
                <p className="mt-2 text-sm leading-6 text-[#60716C]">{formatSessionSchedule(nextSession.date, nextSession.time)}<br />{nextSession.duration} min</p>
                <Badge variant="primary">Confirmada</Badge>
                <Button full variant="outline" className="mt-5" onClick={onSessions}>Ver sesión</Button>
              </div>
            ) : (
              <div className="mt-5">
                <p className="text-sm leading-6 text-[#60716C]">Aún no tienes una sesión próxima. Explora mentores y elige un horario.</p>
                <Button full variant="outline" className="mt-4" onClick={onDiscover}>Explorar mentores</Button>
              </div>
            )}
          </section>

          <section className="rounded-[20px] bg-[#F2E8D7] border border-[#E7D8BF] p-6">
            <Icons.Repeat s={22} c="text-[#24685F]" />
            <h2 className="mt-4 text-xl font-bold">Lo que sabes también puede ayudar a alguien más</h2>
            <p className="mt-2 text-sm leading-6 text-[#60716C]">{onMentorMode ? 'Ya tienes una habilidad aprobada y puedes gestionar tus mentorías.' : 'Solicita validar una habilidad y comparte tus conocimientos.'}</p>
            <Button full className="mt-5" onClick={onMentorMode || onMentorRequest}>{onMentorMode ? 'Ir a modo mentor' : 'Compartir una habilidad'}</Button>
          </section>
          <Button full variant="ghost" onClick={onWallet}>Ver movimientos de créditos</Button>
        </aside>
      </div>

      <RecommendationAssistant
        key={assistantRequest.key}
        mentors={mentors}
        profile={state.profile}
        ratings={state.mentorRatings}
        openRequest={assistantRequest}
        onViewMentor={onMentor}
      />
    </main>
  );
}
