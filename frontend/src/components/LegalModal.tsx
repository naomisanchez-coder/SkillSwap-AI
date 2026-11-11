import { Fragment } from 'react';
import { Icons } from './icons';
import { Modal } from './Modal';
import terms from '../data/legal/terms-1.0.0.md?raw';
import privacy from '../data/legal/privacy-1.0.0.md?raw';
import { LEGAL_VERSIONS } from '../services/registration';

// Copias integras de origin/feature/backend@261b8a5. Sin HTML inyectado.
const legalCopy = { terms: { title: 'Términos de servicio de SkillSwap AI', text: terms }, privacy: { title: 'Política de privacidad de SkillSwap AI', text: privacy } };
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g).map((part, index) => {
    if (part.startsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(part);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer" className="underline break-words">{link[1]}</a>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}
export function LegalModal({ document: documentType, onClose }: { document: keyof typeof legalCopy; onClose: () => void }) {
  const content = legalCopy[documentType];
  return <Modal labelledBy={`legal-${documentType}-title`} onClose={onClose}>
    <div className="w-full max-w-2xl max-h-[calc(100dvh-2rem)] rounded-3xl bg-white border border-[#E4EBE7] shadow-2xl overflow-hidden flex flex-col">
      <div className="shrink-0 p-5 md:p-6 border-b border-[#E4EBE7] flex items-start gap-4">
        <div><span className="inline-flex rounded-full bg-[#FFF4D6] text-[#725D3B] px-3 py-1 text-xs font-bold">VERSIÓN {LEGAL_VERSIONS[documentType]} · REVISIÓN LEGAL PENDIENTE</span>
          <h2 id={`legal-${documentType}-title`} className="mt-3 text-2xl font-bold text-[#17312D]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{content.title}</h2></div>
        <button type="button" onClick={onClose} aria-label="Cerrar modal" className="ml-auto shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-[#64748B] hover:bg-[#FAFBF8]"><Icons.X s={18} /></button>
      </div>
      <div className="min-h-0 p-5 md:p-6 overflow-y-auto space-y-5 text-sm leading-6 text-[#60716C]">
        {content.text.trim().split(/\r?\n\s*\r?\n/).map((block, index) => block.startsWith('# ') ? null : block.startsWith('## ') ? <h3 key={index} className="font-bold text-[#17312D]">{block.slice(3)}</h3> : <p key={index}>{inline(block)}</p>)}
      </div>
      <div className="shrink-0 p-4 md:p-5 border-t border-[#E4EBE7] bg-[#FAFBF8] flex justify-end"><button type="button" onClick={onClose} className="h-11 px-5 rounded-xl bg-[#176B5B] text-white text-sm font-bold hover:bg-[#14594C]">Entendido</button></div>
    </div>
  </Modal>;
}
