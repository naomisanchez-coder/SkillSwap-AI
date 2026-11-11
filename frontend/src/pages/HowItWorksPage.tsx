import { Icons } from '../components/icons';
import { howItWorksPhoto } from '../data/publicContent';
import { PublicFooter, PublicHeader, type PublicDestination } from '../components/PublicChrome';

const steps = [
  ['01', 'Crea y verifica tu cuenta', 'Regístrate con tu correo institucional TECSUP, verifica tu correo y completa tu perfil.', Icons.Users, 'bg-[#DDF6ED]'],
  ['02', 'Descubre mentores recomendados', 'La recomendación inteligente ordena perfiles según habilidad, nivel, disponibilidad y calidad del perfil.', Icons.Zap, 'bg-[#E8F4FF]'],
  ['03', 'Reserva con créditos académicos', 'Elige un horario compatible y utiliza créditos de intercambio, sin valor monetario, para confirmar la sesión.', Icons.Calendar, 'bg-[#FFF4D6]'],
  ['04', 'Conéctate de forma virtual', 'Aprende mediante un enlace externo válido de Google Meet, Zoom o Cisco Webex.', Icons.Play, 'bg-[#FFE9DD]'],
  ['05', 'Califica la experiencia', 'Después de la sesión, comparte tu valoración para orientar a la comunidad.', Icons.Star, 'bg-[#DDF6ED]'],
  ['06', 'Solicita compartir lo que sabes', 'Puedes pedir convertirte en mentor. Cada habilidad queda sujeta a aprobación administrativa.', Icons.Repeat, 'bg-[#E8F4FF]'],
] as const;

export default function HowItWorksPage({
  userName,
  onNavigate,
  onLogin,
  onRegister,
  onDashboard,
  onLogout,
}: {
  userName?: string;
  onNavigate: (destination: PublicDestination) => void;
  onLogin: () => void;
  onRegister: () => void;
  onDashboard: () => void;
  onLogout: () => void;
}) {
  return (
    <main className="public-page min-h-screen bg-[#FAFBF8] text-[#17312D]">
      <PublicHeader active="how-it-works" userName={userName} onNavigate={onNavigate} onLogin={onLogin} onRegister={onRegister} onDashboard={onDashboard} onLogout={onLogout} />
      <section className="bg-[#DDF6ED]/70 border-b border-[#E4EBE7]">
        <div className="max-w-[1120px] mx-auto px-4 md:px-6 py-14 md:py-20 grid grid-cols-1 md:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)] gap-10 items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#176B5B]">Cómo funciona</p>
            <h1 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight">De una duda a una sesión de aprendizaje.</h1>
            <p className="mt-5 text-lg leading-8 text-[#64748B]">Un proceso académico para conectar a estudiantes TECSUP de diferentes carreras y ciclos mediante mentorías virtuales.</p>
          </div>
          <figure>
            <img src={howItWorksPhoto.src} srcSet={howItWorksPhoto.srcSet} sizes="(min-width: 768px) 440px, 100vw" alt={howItWorksPhoto.alt} className="w-full aspect-[4/3] object-cover rounded-[26px] border border-[#BFE8D9] shadow-lg" />
            <figcaption className="mt-2 text-[11px] text-[#60716C]">Fotografía de <a href={howItWorksPhoto.creditUrl} target="_blank" rel="noreferrer" className="underline">{howItWorksPhoto.credit}</a> en Unsplash</figcaption>
          </figure>
        </div>
      </section>

      <section className="max-w-[1120px] mx-auto px-4 md:px-6 py-14 md:py-18">
        <ol className="grid md:grid-cols-2 gap-5">
          {steps.map(([number, title, description, Icon, tone]) => (
            <li key={number} className={`rounded-3xl border border-[#E4EBE7] p-6 md:p-7 ${tone}`}>
              <div className="flex items-center justify-between">
                <span className="w-12 h-12 rounded-2xl bg-white text-[#176B5B] flex items-center justify-center shadow-sm"><Icon s={22} /></span>
                <span className="text-4xl font-extrabold text-[#269A82]/30" aria-hidden="true">{number}</span>
              </div>
              <h2 className="mt-5 text-xl font-bold">
                <span className="sr-only">Paso {number}: </span>{title}
              </h2>
              <p className="mt-2 leading-7 text-[#64748B]">{description}</p>
            </li>
          ))}
        </ol>

        <div className="mt-12 rounded-[26px] bg-white border border-[#E4EBE7] p-7 md:p-9 grid md:grid-cols-2 gap-7">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#DDF6ED] text-[#176B5B] flex items-center justify-center flex-shrink-0"><Icons.Zap s={22} /></div>
            <div>
              <h2 className="text-2xl font-bold">¿Para qué usamos la IA?</h2>
              <p className="mt-3 leading-7 text-[#64748B]">La IA ayuda a ordenar mentores recomendados. No valida habilidades ni toma la decisión administrativa de habilitar a un mentor.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF4D6] text-[#176B5B] flex items-center justify-center flex-shrink-0"><Icons.Coin s={22} /></div>
            <div>
              <h2 className="text-2xl font-bold">Créditos de intercambio</h2>
              <p className="mt-3 leading-7 text-[#64748B]">No tienen valor monetario, no son comprables ni transferibles. Se usan para reservar y se obtienen al completar sesiones válidas como mentor.</p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={() => onNavigate('public-explore')} className="min-h-12 px-6 rounded-xl bg-[#176B5B] text-white font-bold hover:bg-[#14594C]">Explorar habilidades</button>
          {!userName && <button type="button" onClick={onRegister} className="min-h-12 px-6 rounded-xl border border-[#B8D4CA] bg-white text-[#176B5B] font-bold hover:border-[#176B5B]">Crear cuenta</button>}
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
