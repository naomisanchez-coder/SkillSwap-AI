import type { ReactNode } from 'react';
import { Icons } from './icons';
import { PublicLogo } from './PublicChrome';
import { heroPhotos } from '../data/publicContent';

// Marco visual original compartido por registro y login.
export function AuthLayout({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#F7F7F2] text-[#182B2A] lg:grid lg:grid-cols-[minmax(380px,44%)_1fr]">
      <aside className="hidden lg:flex relative min-h-screen overflow-hidden">
        <img src={heroPhotos[0].src} alt={heroPhotos[0].alt} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-[#182B2A]/62" />
        <div className="relative z-10 w-full p-10 xl:p-14 flex flex-col">
          <button type="button" onClick={onBack} className="w-fit flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white">
            <Icons.ChevLeft s={15} /> Volver al inicio
          </button>
          <div className="mt-auto max-w-lg">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#CDE3D9]">Comunidad estudiantil TECSUP</p>
            <h1 className="mt-4 text-4xl xl:text-5xl font-bold leading-tight text-white" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Aprender también es compartir.</h1>
            <p className="mt-5 text-lg leading-8 text-white/78">Forma parte de una comunidad donde estudiantes enseñan, aprenden y crecen juntos.</p>
            <div className="mt-8 flex items-center gap-3 text-sm text-white/75">
              <Icons.Users s={19} />
              <span>Proyecto académico dirigido a estudiantes de TECSUP.</span>
            </div>
          </div>
          <p className="mt-10 text-xs text-white/55">Fotografía de {heroPhotos[0].credit} en Unsplash</p>
        </div>
      </aside>

      <section className="min-h-screen flex flex-col">
        <header className="px-5 sm:px-8 py-5 flex items-center justify-between">
          <button type="button" onClick={onBack} aria-label="Ir al inicio"><PublicLogo /></button>
          <button type="button" onClick={onBack} className="lg:hidden min-h-10 px-3 rounded-xl text-sm font-semibold text-[#60716C] hover:bg-white">
            Volver
          </button>
        </header>
        <div className="flex-1 px-5 sm:px-8 py-6 lg:py-10 flex items-start lg:items-center justify-center">
          <div className="w-full max-w-[470px]">
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
