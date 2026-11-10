import { useId, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Icons } from './icons';

export function SessionModal({ title, description, busy = false, onClose, children }: { title: string; description?: string; busy?: boolean; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  return <Modal labelledBy={titleId} onClose={() => { if (!busy) onClose(); }}>
    <section aria-busy={busy} className="w-full max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[24px] bg-white p-5 sm:p-7 text-[#182B2A] shadow-xl">
      <div className="flex items-start justify-between gap-3"><h2 id={titleId} className="text-xl font-bold">{title}</h2><Button variant="ghost" disabled={busy} aria-label="Cerrar diálogo" onClick={onClose} icon={<Icons.X s={18} />} /></div>
      {description && <p className="mt-2 text-sm leading-6 text-[#60716C] break-words">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  </Modal>;
}
