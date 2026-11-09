import { Icons } from '../components/icons';
import { sharePhoto } from '../data/publicContent';
import { PublicFooter, PublicHeader, type PublicDestination } from '../components/PublicChrome';

const steps = [
  ['Regístrate', 'Crea tu cuenta con un correo institucional TECSUP.'],
  ['Completa tu perfil', 'Cuéntanos qué estudias y qué sabes.'],
  ['Pide validar una habilidad', 'Elige qué quieres enseñar.'],
  ['Declara tu evidencia', 'Adjunta el PDF solicitado por el prototipo.'],
  ['Revisión administrativa', 'Una persona administradora evalúa la solicitud.'],
  ['Habilidad aprobada', 'Se habilita el modo mentor para esa habilidad.'],
];

export default function ShareSkillsPage({
  userName,
  onNavigate,
  onLogin,
  onRegister,
  onDashboard,
  onLogout,
  onStartSharing,
}: {
  userName?: string;
  onNavigate: (destination: PublicDestination) => void;
  onLogin: () => void;
  onRegister: () => void;
  onDashboard: () => void;
  onLogout: () => void;
  onStartSharing: () => void;
}) {
  return (
    <main className="public-page min-h-screen bg-[#FAFBF8] text-[#17312D]">
      <PublicHeader active="share-skills" userName={userName} onNavigate={onNavigate} onLogin={onLogin} onRegister={onRegister} onDashboard={onDashboard} onLogout={onLogout} />
      <section className="bg-[#FFE9DD]/70 border-b border-[#F2D6C7]">
        <div className="max-w-[1120px] mx-auto px-4 md:px-6 py-14 md:py-20 grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] gap-10 lg:gap-14 items-center">
          <div>
            <span className="inline-flex rounded-full bg-white text-[#7A4E3B] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em]">Participación voluntaria entre estudiantes TECSUP</span>
            <h1 className="mt-5 text-4xl md:text-5xl font-extrabold tracking-tight">Lo que sabes puede ayudar a otro estudiante.</h1>
            <p className="mt-5 text-lg leading-8 text-[#64748B]">No necesitas otra cuenta para ser mentor. Solicita compartir una habilidad y espera la aprobación administrativa antes de ofrecer mentorías virtuales.</p>
            <button type="button" onClick={userName ? onStartSharing : onRegister} className="mt-7 min-h-12 px-6 rounded-xl bg-[#176B5B] text-white font-bold hover:bg-[#14594C] inline-flex items-center gap-2">
              Empezar a compartir <Icons.ArrowRight s={16} />
            </button>
            {!userName && <p className="mt-3 text-sm text-[#60716C]">Se creará una cuenta normal de estudiante.</p>}
          </div>
          <figure>
            <img src={sharePhoto.src} srcSet={sharePhoto.srcSet} sizes="(min-width: 1024px) 480px, 100vw" alt={sharePhoto.alt} className="w-full aspect-[4/3] object-cover rounded-[26px] border border-[#F2D6C7] shadow-lg" />
            <figcaption className="mt-2 text-[11px] text-[#60716C]">Fotografía de <a href={sharePhoto.creditUrl} target="_blank" rel="noreferrer" className="underline">{sharePhoto.credit}</a> en Unsplash</figcaption>
          </figure>
        </div>
      </section>

      <section className="max-w-[1120px] mx-auto px-4 md:px-6 py-14 md:py-18">
        <h2 className="text-3xl font-bold tracking-tight">Tu camino para enseñar</h2>
        <ol className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {steps.map(([title, description], index) => (
            <li key={title} className="rounded-2xl border border-[#E4EBE7] bg-white p-5 flex gap-4">
              <span className="w-10 h-10 rounded-full bg-[#176B5B] text-white text-sm font-bold flex items-center justify-center flex-shrink-0">{index + 1}</span>
              <div>
                <p className="font-bold">{title}</p>
                <p className="mt-1 text-sm leading-6 text-[#60716C]">{description}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-8 rounded-2xl border border-[#BFE8D9] bg-[#DDF6ED] p-5 flex items-start gap-3">
          <Icons.Shield s={21} c="text-[#176B5B] flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Aprobación por habilidad</p>
            <p className="mt-1 text-sm leading-6 text-[#64748B]">Una habilidad aprobada te permite enseñar solo esa habilidad. La decisión pertenece al flujo administrativo del prototipo y no representa una validación oficial de TECSUP.</p>
          </div>
        </div>
      </section>

      <section className="bg-[#17312D] text-white">
        <div className="max-w-[1120px] mx-auto px-4 md:px-6 py-14">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#9DE0CD]">Reconocimiento de participación</p>
            <h2 className="mt-3 text-3xl font-bold">Tu aporte queda reflejado en tu actividad.</h2>
            <p className="mt-3 text-sm leading-6 text-[#D4E3DE]">El prototipo registra horas y sesiones completadas como mentor. No promete certificados oficiales ni beneficios económicos.</p>
          </div>
          <div className="mt-8 grid md:grid-cols-3 gap-6">
          {[
            ['Misma cuenta', 'Aprende y enseña sin crear credenciales adicionales.'],
            ['Créditos académicos', 'Obtén créditos de intercambio al completar sesiones válidas.'],
            ['Historial de aporte', 'Consulta tus horas y sesiones de mentoría realizadas.'],
          ].map(([title, description]) => (
            <div key={title}>
              <Icons.Check s={18} c="text-[#9DE0CD]" />
              <p className="mt-3 font-bold text-lg">{title}</p>
              <p className="mt-2 text-sm leading-6 text-[#D4E3DE]">{description}</p>
            </div>
          ))}
          </div>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
