import { useId, type ReactNode } from 'react';

// Input del ui.tsx original, con etiqueta accesible y tamaño táctil mínimo.
export function Input({ label, value, onChange, placeholder, icon }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; icon?: ReactNode;
}) {
  const id = useId();
  return <div className="relative min-w-0">
    <label htmlFor={id} className="sr-only">{label}</label>
    {icon && <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]">{icon}</span>}
    <input id={id} type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} maxLength={200}
      className={`min-h-11 w-full rounded-[10px] border border-[#E2E8E0] bg-white px-3 text-sm text-[#0F172A] placeholder:text-[#9CA3AF] focus:border-[#34877A] focus:outline-none focus:ring-2 focus:ring-[#DCEBDD] ${icon ? 'pl-9' : ''}`} />
  </div>;
}
