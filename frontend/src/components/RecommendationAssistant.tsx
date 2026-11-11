import { skillLabel } from '../data/skillLabels';
import { IntegrationContext, type ChatMessage } from '../services/integrationContext';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Mentor } from '../data/mentors';
import type { UserProfile } from '../data/student';
import {
  findCatalogSkill,
  isEligibleMentor,
  recommendMentors,
  type MentorRecommendation,
  type RecommendationPreferences,
} from '../data/recommendations';
import { Badge, Button } from './ui';
import { Icons } from './icons';

type AssistantStep =
  | 'welcome'
  | 'skill'
  | 'level'
  | 'availability'
  | 'review'
  | 'searching'
  | 'results'
  | 'empty'
  | 'error';

const levelOptions = [
  ['Principiante', 'Estoy empezando'],
  ['Intermedio', 'Tengo conocimientos básicos'],
  ['Avanzado', 'Quiero profundizar'],
] as const;

export function RecommendationAssistant({
  mentors,
  profile,
  ratings,
  openRequest,
  onViewMentor,
}: {
  mentors: Mentor[];
  profile: UserProfile;
  ratings: Record<string, { average: number; count: number }>;
  openRequest?: { skill?: string; key: number };
  onViewMentor: (id: string) => void;
}) {
  const integration = useContext(IntegrationContext);
  const [chatInput, setChatInput] = useState(openRequest?.skill ? `Quiero aprender ${openRequest.skill}` : '');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatInFlight = useRef(false);
  const sendChat = async () => {
    if (!integration || chatInFlight.current || !chatInput.trim()) return;
    chatInFlight.current = true; setChatBusy(true); setChatError('');
    const message = chatInput.trim();
    try {
      // Historial acotado por el contrato; sin reintentos generativos automáticos.
      const history = chatHistory.slice(-4).map(item => ({ ...item, content: Array.from(item.content).slice(0, 1000).join('') }));
      const reply = await integration.chat(message, history);
      setChatHistory(current => [...current, { role: 'user', content: message }, { role: 'assistant', content: reply }]); setChatInput('');
    } catch (error) { setChatError(error instanceof Error ? error.message : 'El asistente no está disponible.'); }
    finally { chatInFlight.current = false; setChatBusy(false); }
  };
  const [open, setOpen] = useState(Boolean(openRequest?.key));
  const [step, setStep] = useState<AssistantStep>(integration ? 'welcome' : openRequest?.key ? openRequest.skill ? 'level' : 'skill' : 'welcome');
  const [skill, setSkill] = useState(openRequest?.skill || profile.interests[0] || '');
  const [skillInput, setSkillInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [level, setLevel] = useState(profile.level || 'Principiante');
  const [availability, setAvailability] = useState(profile.availability || '');
  const [results, setResults] = useState<MentorRecommendation[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const catalogSkills = useMemo(
    () => Array.from(new Set(mentors.filter(mentor => isEligibleMentor(mentor, profile.id)).map(mentor => mentor.skill))),
    [mentors, profile.id],
  );
  const availabilityOptions = useMemo(
    () => Array.from(new Set(
      mentors.filter(mentor => isEligibleMentor(mentor, profile.id)).flatMap(mentor =>
        Object.entries(mentor.slots).flatMap(([day, slots]) =>
          slots.map(time => `${day} · ${time}`),
        ),
      ),
    )),
    [mentors, profile.id],
  );
  useEffect(() => {
    if (!open) return;
    if (!openerRef.current) openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => { if (open) contentRef.current?.focus(); }, [open, step]);

  const reset = () => {
    setStep('welcome');
    setSkill(profile.interests[0] || '');
    setSkillInput('');
    setInputError('');
    setLevel(profile.level || 'Principiante');
    setAvailability(profile.availability || '');
    setResults([]);
  };

  const submitSkillInput = () => {
    const match = findCatalogSkill(skillInput, catalogSkills);
    if (!match) {
      setInputError('No encontramos esa habilidad en el catálogo actual. Elige una de las opciones disponibles.');
      return;
    }
    setSkill(match);
    setInputError('');
    setStep('level');
  };

  const search = async () => {
    if (integration) {
      setStep('searching');
      try { const ranked = await integration.recommendations(); setResults(ranked.slice(0, 3)); setStep(ranked.length ? 'results' : 'empty'); }
      catch { setStep('error'); }
      return;
    }
    setStep('searching');
    try {
      const preferences: RecommendationPreferences = {
        skill,
        level,
        availability,
        goals: profile.goals,
      };
      const ranked = recommendMentors({
        mentors,
        preferences,
        ratings,
        currentUserId: profile.id,
      }).slice(0, 3);
      setResults(ranked);
      setStep(ranked.length ? 'results' : 'empty');
    } catch {
      setStep('error');
    }
  };

  const previous: Partial<Record<AssistantStep, AssistantStep>> = {
    skill: 'welcome',
    level: 'skill',
    availability: 'level',
    review: 'availability',
  };
  const progressByStep: Partial<Record<AssistantStep, number>> = {
    skill: 1,
    level: 2,
    availability: 3,
    review: 3,
  };
  const progress = progressByStep[step];

  return (
    <>
        <button hidden={open} type="button" onClick={event => { openerRef.current = event.currentTarget; setOpen(true); }} className={`${open ? 'hidden' : 'flex'} fixed bottom-4 right-4 sm:right-6 z-30 w-14 h-14 rounded-full bg-[#24685F] text-white shadow-lg items-center justify-center hover:bg-[#1D5149] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24685F]`} aria-label="Abrir Asistente SkillSwap">
          <Icons.ChatSparkle s={25} />
        </button>
      {open && (
        <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="assistant-title" className="fixed z-50 left-3 right-3 bottom-3 sm:left-auto sm:right-6 sm:bottom-6 sm:w-[400px] outline-none">
          <div className="h-[min(620px,calc(100dvh-1.5rem))] rounded-[22px] bg-white border border-[#E2E8E0] shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 p-4 border-b border-[#E2E8E0] bg-[#F7F7F2]">
              <div className="w-10 h-10 rounded-xl bg-[#DCEBDD] text-[#24685F] flex items-center justify-center"><Icons.ChatSparkle s={20} /></div>
              <div>
                <p id="assistant-title" className="font-bold text-[#182B2A]">Asistente SkillSwap</p>
                <p className="text-xs text-[#60716C]">Te ayudo a encontrar un mentor</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar asistente" className="ml-auto w-10 h-10 rounded-xl flex items-center justify-center text-[#60716C] hover:bg-white"><Icons.X s={18} /></button>
            </div>

            {progress && (
              <div className="px-4 py-3 border-b border-[#E2E8E0]">
                <div className="flex justify-between text-xs"><span className="font-semibold text-[#24685F]">Tu búsqueda</span><span className="text-[#60716C]">{progress} de 3</span></div>
                <div className="mt-2 h-1.5 bg-[#E2E8E0] rounded-full overflow-hidden"><div className="h-full bg-[#34877A] transition-[width] motion-reduce:transition-none" style={{ width: `${progress * 33.333}%` }} /></div>
              </div>
            )}

            <div ref={contentRef} tabIndex={-1} aria-label="Paso del asistente" className="min-h-0 flex-1 overflow-y-auto p-4 outline-none">
              {step === 'welcome' && !integration && (
                <AssistantMessage title="¡Hola! ¿Qué te gustaría aprender?" description="Puedo ayudarte a comparar mentores del catálogo usando tus preferencias.">
                  <Button full size="lg" onClick={() => setStep(integration ? 'welcome' : 'skill')}>Empezar mi búsqueda</Button>
                </AssistantMessage>
              )}

              {integration && step === 'welcome' && <div className="space-y-4">
                <p className="text-sm text-[#60716C]">Consulta sobre aprendizaje y mentorías. El asistente orienta; las reservas y los créditos se gestionan desde sus pantallas.</p>
                <div role="log" aria-live="polite" className="space-y-3">{chatHistory.map((item, index) => <p key={index} className="text-sm leading-6 whitespace-pre-wrap"><strong>{item.role === 'user' ? 'Tú' : 'SkillSwap'}: </strong>{item.content}</p>)}</div>
                <form onSubmit={event => { event.preventDefault(); void sendChat(); }} className="space-y-3">
                  <label htmlFor="ai-message" className="text-sm font-semibold text-[#334A46]">Tu consulta</label>
                  <input id="ai-message" value={chatInput} maxLength={1000} disabled={chatBusy} onChange={event => setChatInput(event.target.value)} className="w-full h-11 rounded-xl border border-[#CBD8CE] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#DCEBDD] focus:border-[#34877A]" />
                  <Button full type="submit" disabled={chatBusy || !chatInput.trim()}>{chatBusy ? 'Consultando…' : 'Enviar consulta'}</Button>
                </form>
                {chatError && <p role="alert" className="text-sm text-[#B54747]">{chatError}</p>}
                <Button full variant="outline" onClick={() => void search()}>Ver mis recomendaciones</Button>
              </div>}

              {step === 'skill' && (
                <Question title="Elige una habilidad" description="Puedes elegir una sugerencia o escribir el nombre de una habilidad del catálogo.">
                  <div className="flex flex-wrap gap-2">
                    {catalogSkills.map(option => <Button key={option} variant="outline" onClick={() => { setSkill(option); setStep('level'); }}>{option}</Button>)}
                  </div>
                  <label className="block mt-5 text-sm font-semibold text-[#334A46]" htmlFor="assistant-skill">Escribe una habilidad</label>
                  <div className="mt-2 flex gap-2">
                    <input id="assistant-skill" value={skillInput} maxLength={100} aria-invalid={Boolean(inputError)} aria-describedby={inputError ? 'assistant-skill-error' : undefined} onChange={event => { setSkillInput(event.target.value); setInputError(''); }} onKeyDown={event => { if (event.key === 'Enter') submitSkillInput(); }} placeholder="Ej. Python o Excel" className="min-w-0 flex-1 h-11 rounded-xl border border-[#CBD8CE] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#DCEBDD] focus:border-[#34877A]" />
                    <Button onClick={submitSkillInput}>Buscar</Button>
                  </div>
                  {inputError && <p id="assistant-skill-error" className="mt-2 text-xs leading-5 text-[#B54747]" role="alert">{inputError}</p>}
                </Question>
              )}

              {step === 'level' && (
                <Question title="¿Cuál es tu nivel actual?" description={`Buscaremos una persona que pueda ayudarte con ${skillLabel(skill)}.`}>
                  {levelOptions.map(([value, label]) => <Button key={value} full variant={level === value ? 'secondary' : 'outline'} className="justify-start" onClick={() => { setLevel(value); setStep('availability'); }}>{label}</Button>)}
                </Question>
              )}

              {step === 'availability' && (
                <Question title="¿Cuándo te viene mejor?" description="Preseleccionamos tu horario del perfil; puedes cambiarlo solo para esta búsqueda.">
                  {profile.availability && <Button full variant={availability === profile.availability ? 'secondary' : 'outline'} className="justify-start" onClick={() => { setAvailability(profile.availability); setStep('review'); }}>Mi horario: {profile.availability}</Button>}
                  {availabilityOptions.map(option => <Button key={option} full variant={availability === option ? 'secondary' : 'outline'} className="justify-start" onClick={() => { setAvailability(option); setStep('review'); }}>{option}</Button>)}
                  {!availabilityOptions.length && <p className="text-sm text-[#60716C]">No hay horarios publicados.</p>}
                </Question>
              )}

              {step === 'review' && (
                <Question title="Revisa tu búsqueda" description="Usaremos el mismo motor de compatibilidad de la página Para ti.">
                  <div className="rounded-2xl border border-[#E2E8E0] divide-y divide-[#E2E8E0]">
                    {[['Habilidad', skill], ['Nivel', level], ['Disponibilidad', availability], ['Modalidad', 'Virtual']].map(([label, value]) => <div key={label} className="p-3"><p className="text-xs text-[#60716C]">{label}</p><p className="mt-1 text-sm font-bold text-[#182B2A]">{value || 'Sin definir'}</p></div>)}
                  </div>
                  <Button full size="lg" onClick={search} icon={<Icons.Search s={16} />}>Encontrar mentores</Button>
                </Question>
              )}

              {step === 'searching' && <AssistantMessage title="Buscando coincidencias" description="Estamos comparando la habilidad, el nivel y los horarios con el catálogo virtual actual."><Icons.Loader s={24} c="mx-auto text-[#24685F]" /></AssistantMessage>}

              {step === 'results' && (
                <div>
                  <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-[#182B2A]">Mentores recomendados</h3><p className="mt-1 text-sm text-[#60716C]">Máximo tres coincidencias del catálogo.</p></div><Badge variant="primary">{results.length}</Badge></div>
                  <div className="mt-4 space-y-3">
                    {results.map(({ mentor, compatibility }) => (
                      <article key={mentor.id} className="rounded-2xl border border-[#E2E8E0] p-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <img src={mentor.image} alt={`Foto de ${mentor.name}`} className="w-12 h-12 rounded-xl object-cover object-top" />
                          <div className="min-w-0 flex-1"><p className="font-bold text-[#182B2A] truncate">{mentor.name}</p><p className="text-xs text-[#60716C]">{skillLabel(mentor.skill)} · {mentor.level}</p></div>
                          <Badge variant="primary">{compatibility.label}</Badge>
                        </div>
                        <ul className="mt-3 space-y-1">{compatibility.reasons.slice(0, 2).map(reason => <li key={reason} className="text-xs leading-5 text-[#60716C] flex gap-2"><Icons.Check s={12} c="mt-1 text-[#34877A]" />{reason}</li>)}</ul>
                        <p className="mt-3 text-xs font-semibold text-[#52645F]"><Icons.Clock s={12} /> {mentor.availability}</p>
                        <Button full className="mt-3" data-mentor-id={mentor.id} onClick={() => { setOpen(false); onViewMentor(mentor.id); }}>Ver perfil</Button>
                      </article>
                    ))}
                  </div>
                  <Button full variant="outline" className="mt-4" onClick={() => setStep(integration ? 'welcome' : 'skill')}>Cambiar mi búsqueda</Button>
                </div>
              )}

              {step === 'empty' && <AssistantMessage title="No encontramos mentores disponibles" description="Prueba otra habilidad u horario. No inventaremos resultados fuera del catálogo."><Button onClick={() => setStep(integration ? 'welcome' : 'skill')}>Cambiar mi búsqueda</Button></AssistantMessage>}
              {step === 'error' && <AssistantMessage title="No pudimos calcular las recomendaciones" description="Puedes revisar tus preferencias e intentarlo nuevamente."><Button onClick={() => setStep('review')}>Volver a intentar</Button></AssistantMessage>}
            </div>

            {!['welcome', 'searching'].includes(step) && (
              <div className="p-3 border-t border-[#E2E8E0] bg-[#F7F7F2] flex justify-between">
                {previous[step] ? <Button variant="ghost" onClick={() => setStep(previous[step]!)} icon={<Icons.ChevLeft s={15} />}>Atrás</Button> : <span />}
                <Button variant="ghost" onClick={reset} icon={<Icons.Repeat s={15} />}>Reiniciar</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Question({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div><h3 className="text-lg font-bold text-[#182B2A]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#60716C]">{description}</p><div className="mt-5 space-y-2">{children}</div></div>;
}

function AssistantMessage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="h-full flex flex-col justify-center text-center"><div className="w-14 h-14 rounded-2xl bg-[#DCEBDD] text-[#24685F] mx-auto flex items-center justify-center"><Icons.ChatSparkle s={25} /></div><h3 className="mt-5 text-xl font-bold text-[#182B2A]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#60716C]">{description}</p><div className="mt-6">{children}</div></div>;
}
