import { Icons } from '../components/icons';
import { Avatar } from '../components/ui';
import type { PublicMentor } from '../data/publicMentors';
import { PublicFooter, PublicHeader, type PublicDestination } from '../components/PublicChrome';
import { HeroCarousel } from '../components/HeroCarousel';
import { demoMentorPhotos, homeSecondaryPhoto, heroPhotos, publicSkillCategories } from '../data/publicContent';

const benefits = [
  ['Aprende entre pares', 'Recibe explicaciones de estudiantes que conocen retos académicos similares.', Icons.Users, 'bg-[#DDF6ED]'],
  ['Resuelve dudas concretas', 'Enfoca cada sesión en un tema, ejercicio o herramienta que quieras comprender.', Icons.Search, 'bg-[#E8F4FF]'],
  ['Refuerza tus habilidades', 'Practica competencias técnicas y complementarias fuera del aula.', Icons.Book, 'bg-[#FFF4D6]'],
  ['Crece al enseñar', 'Fortalece tu comunicación y liderazgo cuando acompañas a otro estudiante.', Icons.Award, 'bg-[#FFE9DD]'],
  ['Coordina mejor', 'Encuentra horarios compatibles para una mentoría virtual entre estudiantes.', Icons.Calendar, 'bg-[#DDF6ED]'],
] as const;

const faq = [
  ['¿SkillSwap AI es una plataforma oficial de TECSUP?', 'No. Es un proyecto académico de investigación aplicada dirigido a la comunidad estudiantil de TECSUP.'],
  ['¿Los créditos se pueden comprar o transferir?', 'No. Son créditos académicos de intercambio, sin valor monetario, y solo se usan dentro de la experiencia para reservar mentorías.'],
  ['¿Cómo puedo convertirme en mentor?', 'Puedes solicitar la validación de una habilidad desde tu cuenta. La habilitación depende de una aprobación administrativa.'],
  ['¿Dónde se realizan las sesiones?', 'Todas las mentorías son virtuales mediante un enlace válido de Google Meet, Zoom o Cisco Webex.'],
  ['¿Recibiré un certificado oficial?', 'No se prometen certificados oficiales. El prototipo conserva el historial de horas y sesiones como reconocimiento de participación.'],
] as const;

export default function LandingPage({
  mentors,
  userName,
  onNavigate,
  onLogin,
  onRegister,
  onDashboard,
  onLogout,
}: {
  mentors: PublicMentor[];
  userName?: string;
  onNavigate: (destination: PublicDestination) => void;
  onLogin: () => void;
  onRegister: () => void;
  onDashboard: () => void;
  onLogout: () => void;
}) {
  return (
    <main className="public-page min-h-screen bg-[#FAFBF8] text-[#17312D]">
      <PublicHeader active="landing" userName={userName} onNavigate={onNavigate} onLogin={onLogin} onRegister={onRegister} onDashboard={onDashboard} onLogout={onLogout} />

      <section className="overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-12 md:py-18 lg:py-24 grid grid-cols-1 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,.98fr)] gap-10 lg:gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#BFE8D9] bg-[#DDF6ED] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-[#176B5B]">
              <Icons.Repeat s={14} /> Proyecto académico para estudiantes de TECSUP
            </div>
            <h1 className="mt-6 max-w-[720px] text-[42px] leading-[1.06] sm:text-5xl lg:text-[64px] font-extrabold tracking-[-0.045em]">
              Aprende de tus compañeros. <span className="text-[#176B5B]">Comparte lo que sabes.</span>
            </h1>
            <p className="mt-6 max-w-[680px] text-lg leading-8 text-[#64748B]">
              Encuentra estudiantes de TECSUP que puedan ayudarte a comprender temas académicos y comparte tus habilidades mediante mentorías virtuales.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row sm:flex-wrap gap-3">
              <button type="button" onClick={() => onNavigate('public-explore')} className="min-h-12 px-6 py-3 rounded-xl bg-[#176B5B] text-white font-bold hover:bg-[#14594C] shadow-sm flex items-center justify-center gap-2">
                Encontrar un mentor <Icons.ArrowRight s={16} />
              </button>
              <button type="button" onClick={() => onNavigate('share-skills')} className="min-h-12 px-6 py-3 rounded-xl border border-[#B8D4CA] bg-white text-[#176B5B] font-bold hover:border-[#176B5B] flex items-center justify-center">
                Quiero compartir mis habilidades
              </button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#64748B]">
              <span className="inline-flex items-center gap-2"><Icons.Check s={15} /> Comunidad TECSUP</span>
              <span className="inline-flex items-center gap-2"><Icons.Check s={15} /> Recomendación inteligente</span>
              <span className="inline-flex items-center gap-2"><Icons.Check s={15} /> Mentorías virtuales</span>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-3 rounded-[34px] bg-[#DDF6ED] hidden sm:block" aria-hidden="true" />
            <div className="relative"><HeroCarousel photos={heroPhotos} /></div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#E4EBE7] bg-white">
        <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-16 md:py-20">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#176B5B]">Explorar mentores</p>
              <h2 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight">Compañeros que comparten lo que saben.</h2>
              <p className="mt-4 leading-7 text-[#64748B]">Conoce perfiles de demostración y descubre cómo podría verse una comunidad de aprendizaje colaborativo entre carreras y ciclos.</p>
            </div>
            <button type="button" onClick={() => onNavigate('public-explore')} className="min-h-11 px-5 rounded-xl border border-[#B8D4CA] text-sm font-bold text-[#176B5B] hover:bg-[#DDF6ED]">Explorar catálogo</button>
          </div>
          {!mentors.length && <p className="mt-9 text-[#60716C]">No hay ofertas disponibles en este momento.</p>}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-9">
            {mentors.slice(0, 3).map(mentor => {
              const { id, name, skill } = mentor;
              const image = demoMentorPhotos[id];
              return (
                <article key={id} className="rounded-3xl border border-[#E4EBE7] bg-[#FAFBF8] p-4 flex items-center gap-4">
                  {mentor.image ? <img src={mentor.image} srcSet={image?.srcSet} alt={name} className="w-20 h-20 rounded-2xl object-cover object-top" /> : <div className="w-20 h-20 shrink-0 rounded-2xl bg-[#DCEBDD] flex items-center justify-center"><Avatar name={name} size="lg" /></div>}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#176B5B]">Perfil de demostración</span>
                    <h3 className="mt-1 font-bold">{name}</h3>
                    <p className="mt-1 text-sm text-[#64748B]">{skill}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="max-w-[1280px] mx-auto px-4 md:px-8 py-16 md:py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#176B5B]">Cómo funciona</p>
          <h2 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight">De una duda concreta a una sesión entre pares.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-5 mt-9">
          {[
            ['01', 'Completa tu perfil', 'Regístrate con tu correo institucional TECSUP, verifícalo y cuéntanos qué quieres aprender.'],
            ['02', 'Encuentra una coincidencia', 'La recomendación inteligente considera habilidad, nivel y horarios disponibles.'],
            ['03', 'Reserva y aprende', 'Usa créditos académicos para una sesión virtual y califica la experiencia al finalizar.'],
          ].map(([number, title, description]) => (
            <article key={number} className="rounded-3xl border border-[#E4EBE7] bg-white p-6">
              <span className="text-4xl font-extrabold text-[#269A82]/30">{number}</span>
              <h3 className="mt-5 text-xl font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#64748B]">{description}</p>
            </article>
          ))}
        </div>
        <button type="button" onClick={() => onNavigate('how-it-works')} className="mt-7 min-h-11 px-5 rounded-xl text-sm font-bold text-[#176B5B] bg-[#DDF6ED] hover:bg-[#CBEEDF]">Ver el proceso completo</button>
      </section>

      <section className="bg-[#E8F4FF] border-y border-[#D6E9F8]">
        <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-16 md:py-20 grid md:grid-cols-2 gap-10 items-center">
          <figure>
            <img src={homeSecondaryPhoto.src} srcSet={homeSecondaryPhoto.srcSet} sizes="(min-width: 768px) 560px, 100vw" alt={homeSecondaryPhoto.alt} loading="lazy" className="w-full aspect-[4/3] object-cover rounded-[28px] border border-white shadow-lg" />
            <figcaption className="mt-2 text-[11px] text-[#64748B]">Fotografía de <a href={homeSecondaryPhoto.creditUrl} target="_blank" rel="noreferrer" className="underline">{homeSecondaryPhoto.credit}</a> en Unsplash</figcaption>
          </figure>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#176B5B]">Compartir habilidades</p>
            <h2 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight">Enseñar también es una forma de aprender.</h2>
            <p className="mt-4 leading-7 text-[#64748B]">Cualquier estudiante puede solicitar convertirse en mentor. La participación es voluntaria y cada habilidad requiere aprobación administrativa antes de ofrecer sesiones.</p>
            <p className="mt-4 leading-7 text-[#64748B]">El historial de horas y sesiones reconoce tu aporte a la comunidad, sin prometer certificados oficiales.</p>
            <button type="button" onClick={() => onNavigate('share-skills')} className="mt-6 min-h-11 px-5 rounded-xl bg-white border border-[#B8D4CA] text-sm font-bold text-[#176B5B] hover:border-[#176B5B]">Conocer el proceso para enseñar</button>
          </div>
        </div>
      </section>

      <section className="max-w-[1280px] mx-auto px-4 md:px-8 py-16 md:py-20">
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#176B5B]">Categorías</p>
          <h2 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight">Habilidades técnicas y complementarias.</h2>
          <p className="mt-4 leading-7 text-[#64748B]">Áreas referenciales para explorar intereses entre estudiantes. No representan una malla curricular oficial de TECSUP.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-9">
          {publicSkillCategories.map(category => (
            <article key={category.name} className={`rounded-2xl p-5 border border-[#E4EBE7] ${category.tone}`}>
              <h3 className="text-lg font-bold">{category.name}</h3>
              <p className="mt-2 text-sm leading-6 text-[#64748B]">{category.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-white border-y border-[#E4EBE7]">
        <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-16 md:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#176B5B]">Beneficios</p>
            <h2 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight">Aprendizaje colaborativo que complementa tu formación.</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-9">
            {benefits.map(([title, description, Icon, tone]) => (
              <article key={title} className="rounded-2xl border border-[#E4EBE7] bg-[#FAFBF8] p-5">
                <span className={`w-11 h-11 rounded-xl ${tone} text-[#176B5B] flex items-center justify-center`}><Icon s={20} /></span>
                <h3 className="mt-4 font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#64748B]">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-[1280px] mx-auto px-4 md:px-8 py-16 md:py-20">
        <div className="rounded-[30px] bg-[#17312D] text-white p-7 md:p-12 grid md:grid-cols-[1fr_.9fr] gap-8 items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#9DE0CD]">Créditos académicos de intercambio</p>
            <h2 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight">El conocimiento circula, no se comercializa.</h2>
            <p className="mt-4 leading-7 text-[#D4E3DE]">Los créditos no tienen valor monetario, no se compran y no se transfieren entre usuarios. Se utilizan para reservar mentorías y se obtienen al completar sesiones válidas como mentor.</p>
          </div>
          <ul className="space-y-3 text-sm text-[#EAF4F0]">
            {['Sin valor monetario', 'Uso exclusivo para reservar mentorías', 'Reconocimiento mediante historial de horas y sesiones'].map(item => <li key={item} className="flex gap-3"><Icons.Check s={16} c="mt-0.5 text-[#9DE0CD]" />{item}</li>)}
          </ul>
        </div>
      </section>

      <section className="bg-[#FFF4D6] border-y border-[#F3E4B9]">
        <div className="max-w-[960px] mx-auto px-4 md:px-8 py-16 md:py-20">
          <div className="text-center">
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#176B5B]">Preguntas frecuentes</p>
            <h2 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight">Lo esencial antes de comenzar.</h2>
          </div>
          <div className="mt-9 space-y-3">
            {faq.map(([question, answer]) => (
              <details key={question} className="group rounded-2xl border border-[#E4D6AD] bg-white px-5 py-4">
                <summary className="cursor-pointer list-none font-bold flex items-center justify-between gap-4">{question}<Icons.ChevDown s={17} c="flex-shrink-0 transition-transform group-open:rotate-180" /></summary>
                <p className="mt-3 pr-8 text-sm leading-6 text-[#64748B]">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-[1280px] mx-auto px-4 md:px-8 py-16 md:py-24">
        <div className="rounded-[28px] bg-[#DDF6ED] border border-[#BFE8D9] p-7 md:p-12 grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#176B5B]">Comunidad estudiantil TECSUP</p>
            <h2 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight">Encuentra apoyo. Comparte tu experiencia.</h2>
            <p className="mt-4 max-w-2xl leading-7 text-[#64748B]">SkillSwap AI es un proyecto académico dirigido a estudiantes de TECSUP; no es una plataforma institucional oficial.</p>
          </div>
          <button type="button" onClick={userName ? onDashboard : onRegister} className="min-h-12 px-6 rounded-xl bg-[#176B5B] text-white font-bold hover:bg-[#14594C]">
            {userName ? 'Ir a mi panel' : 'Crear mi cuenta'}
          </button>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
