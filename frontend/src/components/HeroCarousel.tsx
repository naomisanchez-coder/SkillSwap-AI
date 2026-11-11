import { useState, type KeyboardEvent } from 'react';
import { Icons } from './icons';
import type { PublicPhoto } from '../data/publicContent';

/** Carrusel sencillo sin avance automático: flechas, indicadores y teclado. */
export function HeroCarousel({ photos }: { photos: PublicPhoto[] }) {
  const [index, setIndex] = useState(0);
  const go = (next: number) => setIndex((next + photos.length) % photos.length);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1); }
  };
  const current = photos[index];

  return (
    <div
      role="group"
      aria-roledescription="carrusel"
      aria-label="Fotografías de estudiantes compartiendo conocimientos"
      onKeyDown={onKeyDown}
      className="relative"
    >
      <div className="relative w-full overflow-hidden rounded-[28px] border border-[#E4EBE7] bg-[#DDF6ED] shadow-xl aspect-[4/3] min-h-72 sm:min-h-0">
        {photos.map((item, i) => (
          <img
            key={item.src}
            src={item.src}
            srcSet={item.srcSet}
            sizes="(min-width: 1024px) 560px, 100vw"
            alt={i === index ? item.alt : ''}
            aria-hidden={i !== index}
            loading={i === 0 ? 'eager' : 'lazy'}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 motion-reduce:transition-none ${i === index ? 'opacity-100' : 'opacity-0'}`}
          />
        ))}
        <div className="sr-only" aria-live="polite">Fotografía {index + 1} de {photos.length}</div>

        <button type="button" onClick={() => go(index - 1)} aria-label="Fotografía anterior" className="absolute left-3 top-3 sm:top-[38%] w-11 h-11 rounded-full bg-white/95 text-[#17312D] shadow-md flex items-center justify-center hover:bg-white focus-visible:outline-[#176B5B]">
          <Icons.ChevLeft s={20} />
        </button>
        <button type="button" onClick={() => go(index + 1)} aria-label="Fotografía siguiente" className="absolute right-3 top-3 sm:top-[38%] w-11 h-11 rounded-full bg-white/95 text-[#17312D] shadow-md flex items-center justify-center hover:bg-white focus-visible:outline-[#176B5B]">
          <Icons.ChevRight s={20} />
        </button>

        {/* Tarjeta en la parte baja; las fotografías conservan rostros en el tercio superior/central. */}
        <div className="absolute left-3 right-3 sm:left-5 sm:right-auto sm:max-w-[330px] bottom-12 rounded-2xl bg-white/95 backdrop-blur p-3.5 shadow-lg border border-white/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#DDF6ED] text-[#176B5B] flex items-center justify-center flex-shrink-0"><Icons.Zap s={19} /></div>
            <div>
              <p className="text-sm font-bold text-[#17312D]">Recomendación inteligente de mentores</p>
              <p className="text-xs text-[#64748B] mt-0.5">Según habilidad, nivel y disponibilidad para mentorías virtuales.</p>
            </div>
          </div>
        </div>

        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1">
          {photos.map((item, i) => (
            <button
              key={item.src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Ir a la fotografía ${i + 1}`}
              aria-current={i === index}
              className="w-11 h-11 flex items-center justify-center"
            >
              <span className={`block h-2 rounded-full transition-all ${i === index ? 'w-6 bg-white' : 'w-2 bg-white/60'}`} />
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-right text-[11px] text-[#60716C]">
        Fotografía de <a href={current.creditUrl} target="_blank" rel="noreferrer" className="underline">{current.credit}</a> en Unsplash
      </p>
    </div>
  );
}
