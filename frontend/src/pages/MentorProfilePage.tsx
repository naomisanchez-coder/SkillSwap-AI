import { Badge, Button } from '../components/ui';
import { Icons } from '../components/icons';
import { RecommendationReasons } from '../components/StudentUI';
import type { Mentor } from '../data/mentors';
import type { ReviewRecord, UserProfile } from '../data/student';
import { estimateMentorCompatibility } from '../data/recommendations';
import { academicSessionCost as sessionCost } from '../data/creditConfig';
import { PublicLogo } from '../components/PublicChrome';
import { useEffect, useRef, useState } from 'react';
import type { StudentService } from '../services/student';
import type { MentorProfileDetails } from '../data/student';
import { EmptyState } from '../components/StudentUI';

interface Props {
  profile: UserProfile;
  mentor: Mentor;
  onBack: () => void;
  onBooking: () => void;
  communityRating?: { average: number; count: number };
  reviews: ReviewRecord[];
}

function MentorProfileContent({ profile, mentor, communityRating, reviews, onBack, onBooking }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const estimatedCompatibility = estimateMentorCompatibility(
    mentor,
    profile,
    communityRating?.average,
    communityRating?.count,
  );
  const compatibility = mentor.serverManaged ? { total: 0, label: 'Coincidencia parcial' as const, factors: [], reasons: ['Consulta Para ti para ver la puntuación del servidor y su cobertura de evidencia.'], matchingSlots: [] } : estimatedCompatibility;
  const nextSlots = Object.entries(mentor.slots)
    .flatMap(([day, slots]) => slots.map(slot => `${day} · ${slot}`))
    .slice(0, 4);

  return (
    <main className="public-page min-h-screen bg-[#F7F7F2] text-[#182B2A]">
      <header className="sticky top-0 z-20 h-[72px] bg-white/95 backdrop-blur border-b border-[#E2E8E0] px-4 md:px-8 flex items-center">
        <PublicLogo />
        <Button variant="ghost" className="ml-auto" onClick={onBack} icon={<Icons.ChevLeft s={16} />}>Volver</Button>
      </header>

      <div className="max-w-[1120px] mx-auto px-4 md:px-6 py-8 md:py-12">
        <section className="rounded-[24px] bg-[#DCEBDD] border border-[#C9D8CC] p-6 md:p-9">
          <div className="flex flex-col lg:flex-row gap-6 lg:items-center">
            <img src={mentor.image} alt={`Foto de ${mentor.name}`} className="w-32 h-32 shrink-0 rounded-[22px] object-cover object-top bg-white border-4 border-white shadow-sm" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-2">
                <Badge variant="success"><Icons.Check s={12} /> Habilidad aprobada</Badge>
              </div>
              <h1 ref={heading} tabIndex={-1} className="mt-4 break-words text-3xl md:text-4xl font-extrabold">{mentor.name}</h1>
              <p className="mt-2 text-lg text-[#52645F]">{mentor.skill} · Nivel {mentor.level.toLowerCase()}</p>
              <p className="mt-4 max-w-2xl leading-7 text-[#52645F]">{mentor.bio}</p>
            </div>
            <div className="rounded-[18px] bg-white p-5 md:min-w-52 md:max-w-64">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#60716C]">Coincidencia</p>
              <p className="mt-2 text-2xl font-extrabold text-[#24685F]">{compatibility.label}</p>
              {communityRating?.count ? <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-[#60716C]"><Icons.Star s={14} filled /> {communityRating.average.toFixed(1)} · {communityRating.count} valoraciones</p> : <p className="mt-3 text-sm text-[#60716C]">{mentor.serverManaged ? 'Sin valoraciones públicas disponibles.' : 'Aún sin valoraciones'}</p>}
            </div>
          </div>
        </section>

        <div className="grid lg:grid-cols-[1fr_360px] gap-6 mt-6">
          <div className="space-y-6">
            <section className="rounded-[20px] border border-[#E2E8E0] bg-white p-6">
              <h2 className="text-xl font-bold">Qué puede enseñarte</h2>
              <p className="mt-3 font-bold text-[#334A46]">{mentor.offer.topic}</p>
              <p className="mt-2 leading-7 text-[#60716C]">{mentor.offer.description}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {(mentor.topics?.length ? mentor.topics : [mentor.skill]).map(topic => <span key={topic} className="rounded-full bg-[#F2E8D7] px-3 py-2 text-sm font-semibold text-[#493D29]">{topic}</span>)}
              </div>
              {mentor.portfolio && /^https?:\/\//i.test(mentor.portfolio) && (
                <a href={mentor.portfolio} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#24685F] underline underline-offset-4">Ver portafolio público <Icons.ArrowRight s={14} /></a>
              )}
            </section>

            <section className="rounded-[20px] border border-[#E2E8E0] bg-white p-6">
              <h2 className="text-xl font-bold">Reseñas de sesiones completadas</h2>
              {reviews.length ? (
                <div className="mt-4 space-y-3">
                  {reviews.map(review => (
                    <article key={review.id} className="rounded-2xl bg-[#FAFBF8] border border-[#E4EBE7] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span role="img" aria-label={`${review.rating} de 5 estrellas`} className="inline-flex text-[#D89019]">{Array.from({ length: review.rating }, (_, index) => <Icons.Star key={index} s={14} filled />)}</span>
                        <time className="text-xs text-[#64748B]" dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString('es-PE', { timeZone: 'America/Lima' })}</time>
                      </div>
                      <p className="mt-2 text-xs font-semibold text-[#60716C]">Sesión de {review.topic || review.skill || mentor.skill} · Mentor {mentor.name}</p>
                      <p className="mt-3 break-words text-sm leading-6 text-[#52645F]">{review.comment || 'El estudiante no agregó un comentario.'}</p>
                    </article>
                  ))}
                </div>
              ) : <p className="mt-3 text-sm text-[#60716C]">{mentor.serverManaged ? 'Sin valoraciones públicas disponibles.' : 'Aún sin valoraciones'}</p>}
            </section>

            <section className="rounded-[20px] border border-[#E2E8E0] bg-white p-6">
              <h2 className="text-xl font-bold">Por qué encaja contigo</h2>
              <div className="mt-4"><RecommendationReasons compatibility={compatibility} /></div>
              <p className="mt-4 text-xs leading-5 text-[#788983]">La compatibilidad considera tus preferencias y la información del mentor. No garantiza resultados de aprendizaje.</p>
            </section>

            <section className="rounded-[20px] border border-[#E2E8E0] bg-white p-6">
              <h2 className="text-xl font-bold">Modalidad y disponibilidad</h2>
              <p className="mt-3 text-sm text-[#60716C]"><strong className="text-[#334A46]">Modalidad:</strong> Virtual</p>
              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                {Object.entries(mentor.slots).map(([day, slots]) => <div key={day} className="rounded-xl bg-[#F7F7F2] p-4"><p className="font-bold">{day}</p><p className="mt-1 text-sm text-[#60716C]">{slots.join(' · ')}</p></div>)}
              </div>
            </section>
          </div>

          <aside>
            <section className="rounded-[20px] border border-[#E2E8E0] bg-white p-6 shadow-sm lg:sticky lg:top-24">
              <h2 className="text-xl font-bold">Reserva una sesión</h2>
              <p className="mt-2 text-sm leading-6 text-[#60716C]">Elige la duración y el horario en el siguiente paso.</p>
              <div className="mt-5 divide-y divide-[#E2E8E0]">
                {mentor.offer.durations.map(duration => <div key={duration} className="py-3 flex justify-between text-sm"><span>{duration} minutos</span><strong>{mentor.offer.costByDuration[duration] ?? sessionCost(duration)} créditos</strong></div>)}
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.1em] text-[#60716C]">Próximos bloques</p>
              <div className="mt-3 space-y-2">{nextSlots.map(slot => <p key={slot} className="flex items-center gap-2 text-sm text-[#52645F]"><Icons.Clock s={14} /> {slot}</p>)}</div>
              <Button full size="lg" className="mt-6" onClick={onBooking} icon={<Icons.Calendar s={16} />}>Reservar sesión</Button>
              <p className="mt-3 text-xs text-center text-[#788983]">La disponibilidad final se verifica antes de confirmar.</p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

type ProfileLoad = { status: 'loading' } | { status: 'ready'; details: MentorProfileDetails | null } | { status: 'error' };

export default function MentorProfilePage({ profile, mentorId, service, onBack, onBooking }: {
  profile: UserProfile; mentorId: string; service: StudentService; onBack: () => void; onBooking: () => void;
}) {
  const [load, setLoad] = useState<ProfileLoad>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const statusHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true;
    service.getMentorProfile(mentorId).then(details => {
      if (active) setLoad({ status: 'ready', details });
    }, () => { if (active) setLoad({ status: 'error' }); });
    return () => { active = false; };
  }, [mentorId, service, attempt]);
  useEffect(() => { statusHeading.current?.focus(); }, [load]);
  if (load.status === 'ready' && load.details) return <MentorProfileContent profile={profile} mentor={load.details.mentor} communityRating={load.details.rating} reviews={load.details.reviews} onBack={onBack} onBooking={onBooking} />;
  return <main className="public-page min-h-screen bg-[#F7F7F2] px-4 py-8 text-[#182B2A]">
    <div className="mx-auto max-w-[1120px]">
      <Button variant="ghost" onClick={onBack}>Volver</Button>
      {load.status === 'loading' ? <p role="status" className="mt-8">Cargando perfil del mentor…</p> : <section className="mt-8">
        <h1 ref={statusHeading} tabIndex={-1} className="sr-only">{load.status === 'error' ? 'No pudimos cargar el perfil' : 'Perfil no encontrado'}</h1>
        <EmptyState title={load.status === 'error' ? 'No pudimos cargar el perfil' : 'Perfil no encontrado'} description={load.status === 'error' ? 'Vuelve a intentarlo o regresa a la pantalla anterior.' : 'Este mentor no está disponible. Puedes volver y elegir otro perfil.'}
          action={load.status === 'error' ? 'Reintentar' : 'Volver a la pantalla anterior'} onAction={load.status === 'error' ? () => { setLoad({ status: 'loading' }); setAttempt(current => current + 1); } : onBack} />
      </section>}
    </div>
  </main>;
}
