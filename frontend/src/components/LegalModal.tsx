import { Icons } from './icons';
import { Modal } from './Modal';

const legalCopy = {
  terms: {
    title: 'Términos de servicio',
    sections: [
      ['1. Naturaleza del proyecto', 'SkillSwap AI es un proyecto académico dirigido a estudiantes de TECSUP. No es una plataforma oficial de la institución.'],
      ['2. Uso responsable', 'El usuario se compromete a proporcionar información adecuada, respetar a otros estudiantes y utilizar la plataforma únicamente con fines de aprendizaje e intercambio de habilidades.'],
      ['3. Mentorías', 'La aprobación documental de una habilidad permite ofrecer mentorías sobre esa habilidad, pero no representa una garantía absoluta de dominio, resultado académico o calidad de una sesión.'],
      ['4. Créditos', 'Los créditos son académicos, no tienen valor monetario, no se compran y no se transfieren entre usuarios. Se utilizan para reservar mentorías y se obtienen al completar sesiones válidas como mentor.'],
      ['5. Revisión futura', 'Este texto es un borrador y deberá ser revisado antes de cualquier puesta en servicio.'],
    ],
  },
  privacy: {
    title: 'Política de privacidad',
    sections: [
      ['1. Datos del prototipo', 'Esta etapa utiliza datos locales de demostración. No se envían formularios a un backend ni a un proveedor externo de autenticación.'],
      ['2. Datos institucionales', 'El correo institucional se utiliza para simular la pertenencia a la comunidad estudiantil TECSUP. Esta validación no acredita matrícula vigente.'],
      ['3. Almacenamiento local', 'Algunos datos del prototipo pueden permanecer en el navegador mediante almacenamiento local. No deben ingresarse datos sensibles o contraseñas de uso real.'],
      ['4. Derechos y contacto', 'La versión productiva deberá definir mecanismos para consulta, rectificación, eliminación y oposición conforme a la normativa aplicable.'],
      ['5. Revisión futura', 'Este texto es un borrador informativo y requiere revisión legal antes del despliegue.'],
    ],
  },
} as const;

export function LegalModal({
  document: documentType,
  onClose,
}: {
  document: keyof typeof legalCopy;
  onClose: () => void;
}) {
  const content = legalCopy[documentType];
  return (
    <Modal labelledBy={`legal-${documentType}-title`} onClose={onClose}>
      <div className="w-full max-w-2xl max-h-[calc(100dvh-2rem)] rounded-3xl bg-white border border-[#E4EBE7] shadow-2xl overflow-hidden flex flex-col">
        <div className="shrink-0 p-5 md:p-6 border-b border-[#E4EBE7] flex items-start gap-4">
          <div>
            <span className="inline-flex rounded-full bg-[#FFF4D6] text-[#725D3B] px-3 py-1 text-xs font-bold">BORRADOR PARA REVISIÓN LEGAL</span>
            <h2 id={`legal-${documentType}-title`} className="mt-3 text-2xl font-bold text-[#17312D]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{content.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar modal" className="ml-auto shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-[#64748B] hover:bg-[#FAFBF8]">
            <Icons.X s={18} />
          </button>
        </div>
        <div className="min-h-0 p-5 md:p-6 overflow-y-auto">
          <p className="text-sm leading-6 text-[#60716C]">Última actualización del borrador: etapa de prototipo. Este documento no sustituye asesoría legal.</p>
          <div className="mt-6 space-y-6">
            {content.sections.map(([title, text]) => (
              <section key={title}>
                <h3 className="font-bold text-[#17312D]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#60716C]">{text}</p>
              </section>
            ))}
          </div>
        </div>
        <div className="shrink-0 p-4 md:p-5 border-t border-[#E4EBE7] bg-[#FAFBF8] flex justify-end">
          <button type="button" onClick={onClose} className="h-11 px-5 rounded-xl bg-[#176B5B] text-white text-sm font-bold hover:bg-[#14594C]">Entendido</button>
        </div>
      </div>
    </Modal>
  );
}
