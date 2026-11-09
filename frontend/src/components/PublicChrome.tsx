import { useEffect, useRef, useState } from 'react';
import { Icons } from './icons';
import { LegalModal } from './LegalModal';
import { Modal } from './Modal';

export type PublicDestination = 'landing' | 'public-explore' | 'how-it-works' | 'share-skills';

export function PublicLogo() {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className="w-9 h-9 rounded-xl bg-[#269A82] text-white flex items-center justify-center shadow-sm">
        <svg width="21" height="21" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M16 7L19.5 14H26L20.5 18.5L22.5 25L16 21.5L9.5 25L11.5 18.5L6 14H12.5L16 7Z" fill="currentColor" />
        </svg>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-bold text-[#17312D] tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>SkillSwap</span>
        <span className="rounded-md bg-[#DDF6ED] text-[#176B5B] px-1.5 py-0.5 text-[10px] font-bold tracking-wide">AI</span>
      </div>
    </div>
  );
}

export function PublicHeader({
  active,
  userName,
  onNavigate,
  onLogin,
  onRegister,
  onDashboard,
  onLogout,
}: {
  active: PublicDestination;
  userName?: string;
  onNavigate: (destination: PublicDestination) => void;
  onLogin: () => void;
  onRegister: () => void;
  onDashboard: () => void;
  onLogout: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const links: Array<[PublicDestination, string]> = [
    ['public-explore', 'Explorar habilidades'],
    ['how-it-works', 'Cómo funciona'],
    ['share-skills', 'Compartir mis habilidades'],
  ];

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1280px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    const closeMenus = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountOpen(false);
        setMobileOpen(false);
      }
    };
    document.addEventListener('mousedown', closeMenus);
    document.addEventListener('keydown', closeOnEscape);
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      document.removeEventListener('mousedown', closeMenus);
      document.removeEventListener('keydown', closeOnEscape);
      desktop.removeEventListener('change', closeOnDesktop);
    };
  }, []);

  const navigate = (destination: PublicDestination) => {
    onNavigate(destination);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#E4EBE7] bg-[#FAFBF8]/95 backdrop-blur">
      <div className="max-w-[1280px] mx-auto h-18 px-4 md:px-8 flex items-center gap-3 sm:gap-5">
        <button type="button" onClick={() => navigate('landing')} aria-label="Ir al inicio" className="min-h-11 shrink-0">
          <PublicLogo />
        </button>
        <nav className="hidden xl:flex items-center gap-1 ml-auto" aria-label="Navegación pública">
          {links.map(([destination, label]) => (
            <button
              type="button"
              key={destination}
              onClick={() => navigate(destination)}
              aria-current={active === destination ? 'page' : undefined}
              className={`h-11 shrink-0 whitespace-nowrap px-4 rounded-xl text-sm font-semibold transition-colors ${
                active === destination
                  ? 'bg-[#DDF6ED] text-[#176B5B]'
                  : 'text-[#64748B] hover:bg-white hover:text-[#17312D]'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {userName ? (
          <div className="relative ml-auto xl:ml-3" ref={accountRef}>
            <button
              type="button"
              onClick={() => setAccountOpen(value => !value)}
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              className="h-11 pl-1.5 pr-3 rounded-full border border-[#E4EBE7] bg-white flex items-center gap-2.5 text-sm font-semibold text-[#17312D] shadow-sm hover:border-[#B8D4CA] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176B5B]"
            >
              <span className="w-8 h-8 rounded-full bg-[#DDF6ED] text-[#176B5B] flex items-center justify-center font-bold">
                {userName.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase()}
              </span>
              <span className="hidden sm:inline max-w-28 truncate">{userName.split(' ')[0]}</span>
              <Icons.ChevDown s={14} />
            </button>
            {accountOpen && (
              <div role="menu" className="absolute right-0 top-13 w-56 rounded-2xl border border-[#E4EBE7] bg-white p-2 shadow-xl">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setAccountOpen(false); onDashboard(); }}
                  className="w-full h-10 px-3 rounded-xl text-left text-sm font-semibold text-[#17312D] hover:bg-[#FAFBF8]"
                >
                  Ir a mi panel
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setAccountOpen(false); onLogout(); }}
                  className="w-full h-10 px-3 rounded-xl text-left text-sm font-semibold text-[#B54747] hover:bg-[#FFF3F0]"
                >
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="hidden sm:flex shrink-0 items-center gap-2 ml-auto xl:ml-3">
            <button type="button" onClick={onLogin} className="h-11 whitespace-nowrap px-4 rounded-xl text-sm font-semibold text-[#176B5B] hover:bg-white">Iniciar sesión</button>
            <button type="button" onClick={onRegister} className="h-11 whitespace-nowrap px-4 rounded-xl bg-[#176B5B] text-white text-sm font-semibold hover:bg-[#14594C] shadow-sm">Crear cuenta</button>
          </div>
        )}

        <button
          type="button"
          className="xl:hidden ml-auto sm:ml-0 shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-[#17312D] hover:bg-white"
          onClick={() => setMobileOpen(value => !value)}
          aria-expanded={mobileOpen}
          aria-controls="public-mobile-navigation"
          aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
        >
          {mobileOpen ? <Icons.X s={21} /> : <Icons.Menu s={21} />}
        </button>
      </div>

      {mobileOpen && (
        <nav id="public-mobile-navigation" aria-label="Navegación móvil" className="xl:hidden max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-t border-[#E4EBE7] bg-[#FAFBF8] px-4 py-4 space-y-2">
          {links.map(([destination, label]) => (
            <button
              type="button"
              key={destination}
              onClick={() => navigate(destination)}
              aria-current={active === destination ? 'page' : undefined}
              className={`w-full min-h-11 px-4 rounded-xl text-left text-sm font-semibold ${
                active === destination ? 'bg-[#DDF6ED] text-[#176B5B]' : 'text-[#64748B] hover:bg-white'
              }`}
            >
              {label}
            </button>
          ))}
          {!userName && (
            <div className="sm:hidden grid grid-cols-2 gap-2 pt-2">
              <button type="button" onClick={() => { setMobileOpen(false); onLogin(); }} className="h-11 rounded-xl border border-[#B8D4CA] text-sm font-semibold text-[#176B5B]">Iniciar sesión</button>
              <button type="button" onClick={() => { setMobileOpen(false); onRegister(); }} className="h-11 rounded-xl bg-[#176B5B] text-sm font-semibold text-white">Crear cuenta</button>
            </div>
          )}
        </nav>
      )}
    </header>
  );
}

type InfoDialog = 'help' | 'contact' | null;

function InfoModal({ kind, onClose }: { kind: 'help' | 'contact'; onClose: () => void }) {
  const help: Array<[string, string]> = [
    ['¿Cómo creo mi cuenta?', 'Regístrate con tu correo institucional TECSUP, verifica tu correo y completa tus preferencias de aprendizaje.'],
    ['¿Puedo enseñar con la misma cuenta?', 'Sí. Solicita validar una habilidad, adjunta evidencia y, cuando un administrador la apruebe, podrás enseñar esa habilidad.'],
    ['¿La IA valida mis habilidades?', 'No. La IA solo ayuda a ordenar mentores recomendados. La validación de habilidades la revisa una persona administradora.'],
  ];
  const title = kind === 'help' ? 'Centro de ayuda' : 'Contáctanos';
  return (
    <Modal labelledBy={`info-${kind}-title`} onClose={onClose}>
      <div className="w-full max-w-lg max-h-[calc(100vh-2rem)] rounded-3xl bg-white border border-[#E4EBE7] shadow-2xl overflow-hidden flex flex-col">
        <div className="p-5 border-b border-[#E4EBE7] flex items-center gap-4">
          <h2 id={`info-${kind}-title`} className="text-xl font-bold text-[#17312D]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="ml-auto w-10 h-10 rounded-xl flex items-center justify-center text-[#64748B] hover:bg-[#FAFBF8]"><Icons.X s={18} /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-5">
          {kind === 'help' ? help.map(([question, answer]) => (
            <section key={question}>
              <h3 className="font-bold text-[#17312D]">{question}</h3>
              <p className="mt-1.5 text-sm leading-6 text-[#60716C]">{answer}</p>
            </section>
          )) : (
            <>
              <p className="text-sm leading-6 text-[#60716C]">SkillSwap AI es un proyecto académico dirigido a estudiantes de TECSUP y no constituye una plataforma oficial de la institución.</p>
              <p className="text-sm leading-6 text-[#60716C]">En una versión futura, aquí aparecerán los medios de contacto del equipo. Mientras tanto, las dudas del prototipo se comentan directamente con el equipo del proyecto.</p>
            </>
          )}
        </div>
        <div className="p-4 border-t border-[#E4EBE7] bg-[#FAFBF8] flex justify-end">
          <button type="button" onClick={onClose} className="h-11 px-5 rounded-xl bg-[#176B5B] text-white text-sm font-bold hover:bg-[#14594C]">Entendido</button>
        </div>
      </div>
    </Modal>
  );
}

export function PublicFooter() {
  const [info, setInfo] = useState<InfoDialog>(null);
  const [legal, setLegal] = useState<'terms' | 'privacy' | null>(null);
  const linkClass = 'text-left text-sm text-[#CFDAD5] hover:text-white underline-offset-4 hover:underline focus-visible:outline-white min-h-8';
  return (
    <footer className="bg-[#17312D] text-white">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 pt-12 pb-8 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="[&_span]:!text-white"><PublicLogo /></div>
          <p className="mt-4 max-w-sm text-sm leading-6 text-[#D4E3DE]">Proyecto académico de aprendizaje colaborativo dirigido exclusivamente a estudiantes de TECSUP. No es una plataforma oficial de la institución.</p>
        </div>
        <nav aria-label="Ayuda" className="flex flex-col items-start gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#AFCFC3]">Ayuda</p>
          <button type="button" onClick={() => setInfo('help')} className={linkClass}>Centro de ayuda</button>
          <button type="button" onClick={() => setInfo('contact')} className={linkClass}>Contáctanos</button>
        </nav>
        <nav aria-label="Información" className="flex flex-col items-start gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#AFCFC3]">Información</p>
          <button type="button" onClick={() => setLegal('terms')} className={linkClass}>Términos de servicio</button>
          <button type="button" onClick={() => setLegal('privacy')} className={linkClass}>Política de privacidad</button>
        </nav>
      </div>
      <div className="border-t border-white/10">
        <p className="max-w-[1280px] mx-auto px-4 md:px-8 py-5 text-xs text-[#AFC0BA]">SkillSwap AI · Proyecto académico para la comunidad estudiantil TECSUP · Perú</p>
      </div>
      {info && <InfoModal kind={info} onClose={() => setInfo(null)} />}
      {legal && <LegalModal document={legal} onClose={() => setLegal(null)} />}
    </footer>
  );
}
