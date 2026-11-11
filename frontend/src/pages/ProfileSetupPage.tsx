import { skillLabel } from '../data/skillLabels';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { FieldError } from '../components/AuthFields';
import { Icons } from '../components/icons';
import { Modal } from '../components/Modal';
import { PublicLogo } from '../components/PublicChrome';
import { emptyPreferences, profileDays, profileGoals, profileLevels, profileSkills, profileTimes, validateProfileStep, type OnboardingPreferences } from '../data/profileOptions';
import type { ProfileService } from '../services/profile';

const titles = ['¿Qué quieres aprender?', '¿Cuál es tu nivel?', '¿Cuándo puedes aprender?', '¿Cuáles son tus intereses?'];
const descriptions = [
  'Selecciona una o varias habilidades para personalizar tus recomendaciones.',
  'Esto ayuda a encontrar mentores que se adapten a tu punto de partida.',
  'Selecciona el horario que mejor representa tus preferencias. Todas las mentorías son virtuales.',
  'Elige el objetivo académico que mejor representa lo que buscas en este momento.',
];
const choiceStyle = (selected: boolean) => `relative cursor-pointer rounded-xl border px-4 py-3 text-sm font-medium text-[#334A46] ${selected ? 'border-[#C9D8CC] bg-[#DCEBDD] ring-2 ring-[#635BFF]' : 'border-[#CBD8CE] bg-white hover:border-[#34877A]'} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-[#24685F]`;

// Adaptación de ProfileSetupPage.tsx de Figma: mismos pasos y opciones.
export default function ProfileSetupPage({ service, onBack, onComplete, onReset, startEditing = false, backLabel = 'Volver al inicio' }: { service: ProfileService; onBack: () => void; onComplete?: (preferences: OnboardingPreferences) => void; onReset?: () => void; startEditing?: boolean; backLabel?: string }) {
  const [skillOptions, setSkillOptions] = useState(profileSkills);
  const [loaded, setLoaded] = useState<{ preferences: OnboardingPreferences | null } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const resetInFlight = useRef(false);
  useEffect(() => {
    let active = true;
    Promise.all([service.getPreferences(), service.getSkillOptions?.() ?? Promise.resolve(profileSkills)]).then(([preferences, skills]) => { if (active) { setSkillOptions(skills); setLoaded({ preferences }); } }, () => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [service, attempt]);

  const reset = async () => {
    if (resetInFlight.current) return;
    resetInFlight.current = true;
    setResetting(true);
    try {
      await service.resetPreferences();
      onReset?.();
      setLoaded({ preferences: null });
      setLoadError(false);
      setAttempt(current => current + 1);
      setResetOpen(false);
    } catch {
      setLoadError(true);
      setResetOpen(false);
    } finally {
      resetInFlight.current = false;
      setResetting(false);
    }
  };

  return (
    <main className="public-page min-h-screen bg-[#F8FAFC] text-[#111827]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[#E2E8F0] bg-white px-4 py-3 md:px-10">
        <button type="button" onClick={onBack} aria-label={backLabel}><PublicLogo /></button>
        <span className="ml-auto text-sm text-[#64748B]">Perfil de aprendizaje</span>
      </header>
      <div className="mx-auto max-w-[900px] px-4 py-8 md:py-12">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={onBack}>{backLabel}</Button>
          <Button variant="outline" onClick={() => setResetOpen(true)}>Reiniciar preferencias</Button>
        </div>
        {loadError ? <section role="alert" className="rounded-2xl border border-[#E8C2C2] bg-white p-6">
          <h1 className="text-xl font-bold">No pudimos cargar tus preferencias</h1>
          <p className="my-4">Comprueba la conexión con el servicio y vuelve a intentarlo.</p>
          <Button onClick={() => { setLoadError(false); setLoaded(null); setAttempt(current => current + 1); }}>Reintentar</Button>
        </section> : !loaded ? <p role="status">Cargando preferencias…</p> :
          <ProfileWizard skillOptions={skillOptions} key={attempt} initial={loaded.preferences} service={service} onComplete={onComplete} startEditing={startEditing} />}
      </div>
      {resetOpen && <Modal labelledBy="reset-profile-title" onClose={() => { if (!resetting) setResetOpen(false); }}>
        <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h2 id="reset-profile-title" className="text-xl font-bold">¿Reiniciar tus preferencias?</h2>
          <p className="mt-3 text-sm">Se reiniciarán tus preferencias de aprendizaje para que puedas empezar de nuevo.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="outline" disabled={resetting} onClick={() => setResetOpen(false)}>Cancelar</Button>
            <Button disabled={resetting} onClick={() => void reset()}>{resetting ? 'Reiniciando…' : 'Confirmar reinicio'}</Button>
          </div>
        </section>
      </Modal>}
    </main>
  );
}

function ProfileWizard({ initial, service, onComplete, startEditing, skillOptions }: { initial: OnboardingPreferences | null; service: ProfileService; onComplete?: (preferences: OnboardingPreferences) => void; startEditing: boolean; skillOptions: string[] }) {
  const [preferences, setPreferences] = useState<OnboardingPreferences>(() => initial ?? emptyPreferences());
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState(Boolean(initial) && !startEditing);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step, saved]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const change = (patch: Partial<OnboardingPreferences>) => { setPreferences(current => ({ ...current, ...patch })); setError(null); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const validation = validateProfileStep(preferences, step, skillOptions);
    if (validation) {
      setError(validation);
      form.current?.querySelector<HTMLInputElement>('input')?.focus();
      return;
    }
    if (step < 4) { setError(null); setStep(current => current + 1); return; }
    for (let index = 1; index <= 4; index++) {
      const issue = validateProfileStep(preferences, index, skillOptions);
      if (issue) { setStep(index); setError(issue); return; }
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await service.savePreferences(preferences);
      if (mounted.current) { setPreferences(result); setSaved(true); onComplete?.(result); }
    } catch {
      if (mounted.current) setError('No pudimos guardar tus preferencias. Comprueba el almacenamiento del navegador y vuelve a intentarlo. Tus selecciones se conservan.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  if (saved) return <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm md:p-10">
    <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold">Preferencias guardadas</h1>
    <p className="mt-3 text-[#64748B]">Tus preferencias se guardaron en este dispositivo.</p>
    <dl className="mt-6 space-y-4 break-words">
      {[['Habilidades', preferences.interests.join(', ')], ['Nivel', preferences.level], ['Disponibilidad', preferences.availability], ['Objetivo', preferences.goals], ['Modalidad', preferences.modality]].map(([label, value]) => <div key={label}><dt className="text-sm text-[#64748B]">{label}</dt><dd className="font-semibold">{value}</dd></div>)}
    </dl>
    <p className="my-6 rounded-xl bg-[#DCEBDD] p-4 text-sm text-[#1D5149]">Tus preferencias nos ayudarán a personalizar tu experiencia de aprendizaje.</p>
    <Button onClick={() => { setSaved(false); setStep(1); }}>Editar preferencias</Button>
    {onComplete && <Button className="ml-3" onClick={() => onComplete(preferences)}>Ir a mi panel</Button>}
  </section>;

  return <>
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-2 text-sm">
        <p className="font-semibold text-[#635BFF]">Paso {step} de 4</p><p className="text-[#64748B]">{step * 25}% del recorrido</p>
      </div>
      <div role="progressbar" aria-label="Pasos del perfil" aria-valuemin={0} aria-valuemax={4} aria-valuenow={step} className="h-2 overflow-hidden rounded-full bg-[#E2E8F0]">
        <div className="h-full rounded-full bg-[#635BFF] transition-all duration-300" style={{ width: `${step * 25}%` }} />
      </div>
    </div>
    <form ref={form} onSubmit={event => void submit(event)} noValidate className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm md:p-10" aria-busy={saving}>
      <h1 ref={heading} tabIndex={-1} id="profile-step-title" className="text-2xl font-bold md:text-3xl">{titles[step - 1]}</h1>
      <p id="profile-step-description" className="mt-2 text-[#64748B]">{descriptions[step - 1]} Campo obligatorio.</p>
      <fieldset disabled={saving} aria-labelledby="profile-step-title" aria-describedby={`profile-step-description${error ? ' profile-error' : ''}`} className="mt-8 min-w-0">
        <legend className="sr-only">{titles[step - 1]}</legend>
        {step === 1 && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {skillOptions.map(skill => <label key={skill} className={`${choiceStyle(preferences.interests.includes(skill))} flex min-h-16 items-center justify-center text-center break-words`}>
            <input className="sr-only" type="checkbox" name="interests" value={skill} checked={preferences.interests.includes(skill)} onChange={() => change({ interests: preferences.interests.includes(skill) ? preferences.interests.filter(item => item !== skill) : [...preferences.interests, skill] })} />
            <span>{skillLabel(skill)}</span>{preferences.interests.includes(skill) && <span aria-hidden="true" className="absolute right-1 top-1"><Icons.Check s={12} /></span>}
          </label>)}
        </div>}
        {step === 2 && <div className="grid gap-4 md:grid-cols-3">
          {profileLevels.map(([name, description]) => <label key={name} className={`${choiceStyle(preferences.level === name)} flex min-h-32 flex-col justify-center gap-2 px-5`}>
            <input className="sr-only" type="radio" name="level" value={name} checked={preferences.level === name} onChange={() => change({ level: name })} />
            <span className="text-base font-bold text-[#111827]">{name}</span><span className="text-sm font-normal text-[#64748B]">{description}</span>
          </label>)}
        </div>}
        {step === 3 && <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 lg:gap-2">
            {profileDays.map(day => <div key={day}>
              <p className="mb-2 text-center text-xs font-semibold text-[#64748B]">{day}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-1">
                {profileTimes.map(time => {
                  const value = `${day} · ${time}`;
                  return <label key={time} className={`${choiceStyle(preferences.availability === value)} flex min-h-16 items-center justify-center px-1 text-center text-xs`}>
                    <input className="sr-only" type="radio" name="availability" value={value} aria-label={value} checked={preferences.availability === value} onChange={() => change({ availability: value })} />
                    <span>{time}</span>
                  </label>;
                })}
              </div>
            </div>)}
          </div>
          <div className="mt-7 rounded-xl border border-[#C9D8CC] bg-[#DCEBDD] p-4 text-sm text-[#1D5149]"><strong>Mentoría virtual</strong><p className="mt-1">Las sesiones se realizan mediante un enlace externo asignado manualmente por el mentor.</p></div>
        </>}
        {step === 4 && <div className="grid gap-3 md:grid-cols-2">
          {profileGoals.map(goal => <label key={goal} className={`${choiceStyle(preferences.goals === goal)} flex min-h-14 items-center gap-2`}>
            <input className="sr-only" type="radio" name="goals" value={goal} checked={preferences.goals === goal} onChange={() => change({ goals: goal })} />
            {preferences.goals === goal && <span aria-hidden="true"><Icons.Check s={16} /></span>}<span>{goal}</span>
          </label>)}
        </div>}
      </fieldset>
      {error && <FieldError id="profile-error" message={error} />}
      <div className="mt-10 flex flex-col-reverse justify-between gap-3 border-t border-[#E2E8F0] pt-6 sm:flex-row">
        <Button variant="ghost" disabled={step === 1 || saving} onClick={() => { setError(null); setStep(current => current - 1); }}>Atrás</Button>
        <Button type="submit" disabled={saving} className="sm:min-w-52">{saving ? 'Guardando…' : step === 4 ? 'Guardar preferencias' : 'Continuar'}<span aria-hidden="true"><Icons.ChevRight s={16} /></span></Button>
      </div>
    </form>
  </>;
}
