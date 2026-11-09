import { useMemo, useState } from 'react';
import { Icons } from '../components/icons';
import { PublicFooter, PublicHeader, type PublicDestination } from '../components/PublicChrome';
import type { PublicMentor } from '../data/publicMentors';
import { demoMentorPhotos, publicSkillCategories } from '../data/publicContent';

export default function PublicExplorePage({
  mentors,
  userName,
  onNavigate,
  onLogin,
  onRegister,
  onDashboard,
  onLogout,
  onPrivateExplore,
  onMentor,
}: {
  mentors: PublicMentor[];
  userName?: string;
  onNavigate: (destination: PublicDestination) => void;
  onLogin: () => void;
  onRegister: () => void;
  onDashboard: () => void;
  onLogout: () => void;
  onPrivateExplore: () => void;
  onMentor: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const visibleMentors = useMemo(() => {
    const value = query.trim().toLowerCase();
    return mentors
      .filter(mentor => mentor.active !== false)
      .filter(mentor => !value
        || mentor.skill.toLowerCase().includes(value)
        || mentor.name.toLowerCase().includes(value)
        || mentor.bio.toLowerCase().includes(value));
  }, [mentors, query]);

  return (
    <main className="public-page min-h-screen bg-[#FAFBF8] text-[#17312D]">
      <PublicHeader active="public-explore" userName={userName} onNavigate={onNavigate} onLogin={onLogin} onRegister={onRegister} onDashboard={onDashboard} onLogout={onLogout} />
      <section className="border-b border-[#E4EBE7] bg-[#E8F4FF]/55">
        <div className="max-w-[1120px] mx-auto px-4 md:px-6 py-12 md:py-18">
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#176B5B]">Comunidad TECSUP</p>
          <h1 className="mt-3 max-w-3xl text-4xl md:text-5xl font-extrabold tracking-tight">Descubre habilidades y conoce a la comunidad.</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-[#64748B]">Explora áreas referenciales y perfiles de demostración. Al completar tu perfil, la recomendación inteligente podrá ordenar mentores según tus necesidades.</p>
          <label htmlFor="public-skill-search" className="block mt-8 text-sm font-bold text-[#17312D]">Buscar habilidad o mentor</label>
          <div className="relative mt-2 max-w-2xl">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#60716C]"><Icons.Search s={18} /></span>
            <input id="public-skill-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ej. Python, Excel o redes" className="w-full h-12 rounded-xl border border-[#C9D9D3] bg-white pl-11 pr-4 text-[#17312D] placeholder:text-[#7B8C88] focus:outline-none focus:ring-2 focus:ring-[#BFE8D9] focus:border-[#176B5B]" />
          </div>
        </div>
      </section>

      <section className="max-w-[1120px] mx-auto px-4 md:px-6 py-12">
        <h2 className="text-2xl font-bold">Áreas que puedes explorar</h2>
        <p className="mt-2 text-sm text-[#64748B]">Estas categorías orientan la exploración y no equivalen a una malla curricular oficial de TECSUP.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {publicSkillCategories.map(category => (
            <button type="button" key={category.name} onClick={() => setQuery(category.query)} className={`min-h-32 rounded-2xl border border-[#E4EBE7] p-5 text-left hover:-translate-y-0.5 hover:shadow-md transition-all focus-visible:outline-[#176B5B] ${category.tone}`}>
              <p className="font-bold text-lg">{category.name}</p>
              <p className="mt-2 text-sm leading-6 text-[#52645F]">{category.description}</p>
            </button>
          ))}
        </div>

        <div className="mt-14 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Vista previa de mentores</h2>
            <p className="mt-2 text-[#64748B]">Perfiles ficticios de demostración; no representan personas ni validaciones institucionales oficiales.</p>
          </div>
        </div>

        {visibleMentors.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#B8C9BD] bg-white py-14 px-6 text-center">
            <p className="font-bold">No hay mentores públicos para esta búsqueda.</p>
            <p className="mt-2 text-sm text-[#60716C]">Prueba con Python o explora otra categoría.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
            {visibleMentors.map(mentor => {
              const demoPhoto = demoMentorPhotos[mentor.id];
              const isDemo = Boolean(demoPhoto);
              const initials = mentor.name.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();
              return (
                <article key={mentor.id} className="rounded-2xl border border-[#E4EBE7] bg-white overflow-hidden shadow-sm flex flex-col">
                  {demoPhoto ? (
                    <img src={demoPhoto.src} srcSet={demoPhoto.srcSet} sizes="(min-width: 1024px) 360px, 100vw" alt={demoPhoto.alt} loading="lazy" className="w-full h-52 object-cover object-top bg-[#DDF6ED]" />
                  ) : mentor.image && !mentor.image.startsWith('data:') ? (
                    <img src={mentor.image} alt={`Foto de perfil de ${mentor.name}`} loading="lazy" className="w-full h-52 object-cover bg-[#DDF6ED]" />
                  ) : (
                    <div className="w-full h-52 bg-[#DDF6ED] text-[#176B5B] flex items-center justify-center text-5xl font-extrabold" aria-hidden="true">{initials}</div>
                  )}
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      {mentor.skillValidated && <span className="rounded-full bg-[#DDF6ED] text-[#176B5B] px-3 py-1.5 inline-flex items-center gap-1.5"><Icons.Check s={12} /> Habilidad aprobada en el prototipo</span>}
                      {isDemo && <span className="rounded-full bg-[#FFF4D6] text-[#6B5836] px-3 py-1.5">Perfil de demostración</span>}
                    </div>
                    <p className="mt-3 text-xl font-bold">{mentor.name}</p>
                    <p className="mt-1 text-sm text-[#60716C]">{mentor.skill} · Nivel {mentor.level.toLowerCase()}</p>
                    <p className="mt-3 text-sm text-[#60716C] inline-flex items-center gap-2"><Icons.Calendar s={14} /> Disponibilidad general: {mentor.availability}</p>
                    <button type="button" onClick={() => userName ? onMentor(mentor.id) : onLogin()} className="mt-5 w-full min-h-11 rounded-xl border border-[#B8D4CA] text-sm font-bold text-[#176B5B] hover:bg-[#FAFBF8]">
                      {userName ? 'Ver perfil y disponibilidad' : 'Iniciar sesión para continuar'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-[#DDF6ED] border-y border-[#BFE8D9]">
        <div className="max-w-[900px] mx-auto px-4 md:px-6 py-14 text-center">
          <h2 className="text-3xl font-bold">Encuentra a alguien que ya sabe lo que quieres aprender.</h2>
          <p className="mt-4 leading-7 text-[#64748B]">Conecta con estudiantes TECSUP de distintas carreras y ciclos según tus objetivos y horarios.</p>
          <button type="button" onClick={userName ? onPrivateExplore : onRegister} className="mt-6 min-h-12 px-6 rounded-xl bg-[#176B5B] text-white font-bold hover:bg-[#14594C]">Descubrir mis recomendaciones</button>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
