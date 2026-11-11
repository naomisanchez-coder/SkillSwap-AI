import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LegalModal } from '../components/LegalModal';
import { Icons } from '../components/icons';
import { ACADEMIC_CYCLES, AUTHORIZED_TECSUP_EMAIL_DOMAINS, normalizeTecsupEmail, TECSUP_CAREERS, TECSUP_INSTITUTION } from '../data/academicCatalog';
import { validateRegistrationForm } from '../data/registrationValidation';
import { LEGAL_VERSIONS, registerStudent, RegistrationError, type RegistrationService } from '../services/registration';

import { AuthLayout } from '../components/AuthLayout';
import { AuthField, PasswordField, SelectField, FieldError } from '../components/AuthFields';

// Presentación y campos adaptados de AuthPage.tsx del prototipo original.
export default function RegisterPage({ onBack, onLogin, service = registerStudent, localPreview = false, onVerifyEmail }: { onBack: () => void; onLogin: () => void; service?: RegistrationService; localPreview?: boolean; onVerifyEmail?: (email: string) => void }) {
  return <AuthLayout onBack={onBack}><RegisterForm onSwitch={onLogin} service={service} localPreview={localPreview} onVerifyEmail={onVerifyEmail} /></AuthLayout>;
}

function RegisterForm({ onSwitch, service, localPreview, onVerifyEmail }: { onSwitch: () => void; service: RegistrationService; localPreview: boolean; onVerifyEmail?: (email: string) => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [career, setCareer] = useState('');
  const [cycle, setCycle] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [legalDocument, setLegalDocument] = useState<'terms' | 'privacy' | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [retryUntil, setRetryUntil] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [createdEmail, setCreatedEmail] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    if (!retryUntil) return;
    const update = () => setRetrySeconds(Math.max(0, Math.ceil((retryUntil - Date.now()) / 1000)));
    update(); const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryUntil]);
  useEffect(() => {
    if (Object.keys(errors).length) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-registration-error]')?.focus();
    }
  }, [errors]);
  useEffect(() => { if (createdEmail) successRef.current?.focus(); }, [createdEmail]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || Date.now() < retryUntil) return;
    const nextErrors = validateRegistrationForm({ firstName, lastName, email, career, cycle, password, confirmPassword, accepted });
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    setErrors({});
    inFlight.current = true;
    setLoading(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const user = await service({ firstName: firstName.trim(), lastName: lastName.trim(),
        email: normalizeTecsupEmail(email), career, cycle: Number(cycle), password,
        termsAccepted: true, termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy }, controller.signal);
      if (controller.signal.aborted) return;
      setPassword('');
      setConfirmPassword('');
      if (localPreview && onVerifyEmail) onVerifyEmail(user.email);
      else setCreatedEmail(user.email);
    } catch (error) {
      if (!controller.signal.aborted) {
        setErrors(error instanceof RegistrationError ? error.fields : { general: 'No fue posible completar el registro. Inténtalo más tarde.' });
        if (error instanceof RegistrationError && error.retryAfterSeconds) { setRetryUntil(Date.now() + error.retryAfterSeconds * 1000); setRetrySeconds(error.retryAfterSeconds); }
      }
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  if (createdEmail) return (
    <section aria-labelledby="registration-success">
      <span className="inline-flex rounded-full bg-[#DDF6ED] px-3 py-1 text-sm font-bold text-[#176B5B]">Verificación pendiente</span>
      <h1 ref={successRef} tabIndex={-1} id="registration-success" className="mt-4 text-3xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Cuenta creada</h1>
      <p className="mt-4 leading-7 text-[#60716C]">Registramos tu cuenta de estudiante con el correo <strong className="break-all text-[#182B2A]">{createdEmail}</strong>.</p>
      <p role="status" className="mt-5 rounded-2xl border border-[#D5C7AE] bg-[#F8F0E2] p-4 text-sm leading-6 text-[#725D3B]">Tu correo sigue sin verificar. El envío y la verificación de correo todavía requieren integración; no hemos enviado ningún mensaje. Podrás acceder cuando se habilite ese proceso y verifiques tu cuenta.</p>
      <p className="mt-4 text-sm text-[#60716C]">El registro no inicia sesión. Tu perfil queda pendiente de completar.</p>
      {onVerifyEmail && <button type="button" onClick={() => onVerifyEmail(createdEmail)} className="mt-6 min-h-12 w-full rounded-xl bg-[#24685F] text-white font-bold">Verificar correo</button>}
      <button type="button" onClick={onSwitch} className="mt-3 min-h-11 w-full text-sm font-bold text-[#24685F]">Volver a iniciar sesión</button>
    </section>
  );

  return (
    <>
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#24685F]">Cuenta de estudiante</p>
        <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Crea tu cuenta</h2>
        <p className="mt-3 text-[#60716C]">Cuenta exclusiva para estudiantes de TECSUP. Usarás el mismo perfil académico si luego accedes al modo mentor.</p>
      </div>

      <form ref={formRef} onSubmit={submit} noValidate aria-busy={loading} className="mt-8 space-y-5">
        <fieldset disabled={loading} className="space-y-5 min-w-0">
        <legend className="sr-only">Datos del registro</legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <AuthField id="register-first-name" label="Nombres" value={firstName} onChange={setFirstName} placeholder="Tus nombres" autoComplete="given-name" error={errors.firstName} maxLength={200} icon={<Icons.Users s={17} />} />
          <AuthField id="register-last-name" label="Apellidos" value={lastName} onChange={setLastName} placeholder="Tus apellidos" autoComplete="family-name" error={errors.lastName} maxLength={200} />
        </div>
        <AuthField id="register-institution" label="Institución" value={TECSUP_INSTITUTION} onChange={() => {}} helper="Institución fija para este proyecto académico." disabled />
        <AuthField
          id="register-email"
          label="Correo institucional TECSUP"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="nombre.apellido@tecsup.edu.pe"
          autoComplete="email"
          error={errors.email}
          maxLength={254}
          helper={`Formato: nombre.apellido, con un solo punto y únicamente letras. Dominio autorizado: ${AUTHORIZED_TECSUP_EMAIL_DOMAINS.map(domain => `@${domain}`).join(', ')}`}
          icon={<Icons.Mail s={17} />}
        />
        <div className="grid sm:grid-cols-[1fr_150px] gap-4">
          <SelectField id="register-career" label="Carrera" value={career} onChange={setCareer} error={errors.career}>
            <option value="">Selecciona tu carrera</option>
            {TECSUP_CAREERS.map(item => <option key={item}>{item}</option>)}
          </SelectField>
          <SelectField id="register-cycle" label="Ciclo académico" value={cycle} onChange={setCycle} error={errors.cycle}>
            <option value="">Selecciona</option>
            {ACADEMIC_CYCLES.map(item => <option key={item} value={item}>{item}.º ciclo</option>)}
          </SelectField>
        </div>
        <p className="-mt-2 text-xs leading-5 text-[#60716C]">Catálogo 1.0.0 del registro. No acredita disponibilidad por sede ni duración oficial; el servidor comprueba que la carrera y el ciclo estén activos.</p>
        <PasswordField id="register-password" label="Contraseña" value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword(value => !value)} error={errors.password} autoComplete="new-password" maxLength={256} />
        <div className="-mt-2 rounded-xl bg-[#F7F7F2] px-4 py-3 text-xs text-[#60716C]">
          <span className={`inline-flex items-center gap-1.5 font-semibold ${[...password].length >= 8 ? 'text-[#237A57]' : ''}`}>
            <Icons.Check s={13} /> Mínimo 8 caracteres
          </span>
        </div>
        <PasswordField id="register-confirm" label="Confirmar contraseña" value={confirmPassword} onChange={setConfirmPassword} show={showConfirm} onToggle={() => setShowConfirm(value => !value)} error={errors.confirm} autoComplete="new-password" maxLength={256} />

        <div>
          <div className="flex items-start gap-3">
            <label htmlFor="register-terms" className="sr-only">Acepto los términos de servicio y la política de privacidad</label>
            <input id="register-terms" type="checkbox" aria-invalid={Boolean(errors.terms)} aria-describedby={errors.terms ? "register-terms-error" : "register-terms-helper"} checked={accepted} onChange={event => setAccepted(event.target.checked)} className="mt-1 w-4 h-4 accent-[#24685F] flex-shrink-0" />
            <span className="text-sm leading-6 text-[#52645F]">
              Acepto los{' '}
              <button type="button" onClick={() => setLegalDocument('terms')} className="font-bold text-[#24685F] underline underline-offset-2">términos de servicio</button>
              {' '}y la{' '}
              <button type="button" onClick={() => setLegalDocument('privacy')} className="font-bold text-[#24685F] underline underline-offset-2">política de privacidad</button>.
            </span>
          </div>
          <p id="register-terms-helper" className="mt-2 text-xs text-[#60716C]">Términos {LEGAL_VERSIONS.terms} y privacidad {LEGAL_VERSIONS.privacy}. Textos en borrador para revisión.</p>
          {errors.terms && <FieldError id="register-terms-error" message={errors.terms} />}
        </div>
        {errors.general && <div tabIndex={-1} data-registration-error role="alert" className="rounded-xl border border-[#E8C2C2] bg-[#FFF3F0] px-4 py-3 text-sm font-semibold text-[#B54747]">{errors.general}</div>}
        </fieldset>
        {retrySeconds > 0 && <p role="status" className="text-sm text-[#725D3B]">Puedes volver a enviar el registro en {retrySeconds} segundos. No se enviará automáticamente.</p>}
        <button type="submit" disabled={loading || retrySeconds > 0} className="w-full min-h-12 rounded-xl bg-[#24685F] text-white font-bold hover:bg-[#1D5149] disabled:opacity-55 flex items-center justify-center gap-2">
          {loading && <Icons.Loader s={16} />} {loading ? 'Creando cuenta…' : retrySeconds > 0 ? 'Espera para reintentar' : 'Crear cuenta de estudiante'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[#60716C]">
        ¿Ya tienes una cuenta?{' '}
        <button type="button" disabled={loading} onClick={onSwitch} className="font-bold text-[#24685F] hover:text-[#1D5149]">Iniciar sesión</button>
      </p>
      {legalDocument && <LegalModal document={legalDocument} onClose={() => setLegalDocument(null)} />}
    </>
  );
}
