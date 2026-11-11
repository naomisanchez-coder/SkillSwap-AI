import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AuthLayout } from '../components/AuthLayout';
import { AuthField, PasswordField } from '../components/AuthFields';
import { Icons } from '../components/icons';
import { AuthError, login, type AuthSession } from '../services/auth';
import PasswordRecoveryForm from './PasswordRecoveryForm';

// Formulario y presentación de AuthPage.tsx del prototipo; acceso por la API real.
export default function LoginPage({ onBack, onRegister, onAuthenticated }: {
  onBack: () => void; onRegister: () => void;
  onAuthenticated: (session: AuthSession) => void;
}) {
  const [email, setEmail] = useState('');
  const [recovering, setRecovering] = useState(false);
  const recoveryButton = useRef<HTMLButtonElement>(null);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    if (Object.keys(errors).length) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-login-error]')?.focus();
  }, [errors]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    const nextErrors: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254) nextErrors.email = 'Ingresa un correo electrónico válido (máximo 254 caracteres).';
    if (password.length < 8 || password.length > 128) nextErrors.password = 'Ingresa tu contraseña de 8 a 128 caracteres.';
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    inFlight.current = true;
    setErrors({});
    setLoading(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const session = await login({ email: email.trim().toLowerCase(), password, remember }, controller.signal);
      if (!controller.signal.aborted) { setPassword(''); onAuthenticated(session); }
    } catch (error) {
      if (!controller.signal.aborted) setErrors({ general: error instanceof AuthError ? error.message : 'No fue posible iniciar sesión. Inténtalo más tarde.' });
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  if (recovering) return <AuthLayout onBack={onBack}>
    <PasswordRecoveryForm initialEmail={email} onBack={() => {
      setRecovering(false);
      requestAnimationFrame(() => recoveryButton.current?.focus());
    }} />
  </AuthLayout>;

  return (
    <AuthLayout onBack={onBack}>
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#24685F]">Bienvenido nuevamente</p>
        <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Inicia sesión en SkillSwap</h2>
        <p className="mt-3 text-[#60716C]">Continúa aprendiendo y compartiendo con tu comunidad.</p>
      </div>
      <form ref={formRef} onSubmit={submit} noValidate aria-busy={loading} className="mt-8 space-y-5">
        <fieldset disabled={loading} className="space-y-5 min-w-0">
          <legend className="sr-only">Datos de acceso</legend>
          <AuthField id="login-email" label="Correo electrónico" type="email" value={email} onChange={setEmail}
            placeholder="nombre.apellido@tecsup.edu.pe" autoComplete="email" maxLength={254} error={errors.email} icon={<Icons.Mail s={17} />} />
          <PasswordField id="login-password" label="Contraseña" value={password} onChange={setPassword}
            show={showPassword} onToggle={() => setShowPassword(value => !value)} error={errors.password} autoComplete="current-password" />
          <div className="text-right">
            <button ref={recoveryButton} type="button" onClick={() => { setPassword(''); setShowPassword(false); setErrors({}); setRecovering(true); window.scrollTo({ top: 0, behavior: 'instant' }); }} className="min-h-10 text-sm font-bold text-[#24685F] hover:text-[#1D5149] disabled:opacity-55">¿Olvidaste tu contraseña?</button>
          </div>
          <label className="flex items-center gap-3 w-fit cursor-pointer">
            <input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} className="w-4 h-4 accent-[#24685F]" />
            <span className="text-sm text-[#52645F]">Recordarme en este dispositivo</span>
          </label>
          {errors.general && <div tabIndex={-1} data-login-error role="alert" className="rounded-xl border border-[#E8C2C2] bg-[#FFF3F0] px-4 py-3 text-sm font-semibold text-[#B54747]">{errors.general}</div>}
        </fieldset>
        <button type="submit" disabled={loading} className="w-full min-h-12 rounded-xl bg-[#24685F] text-white font-bold hover:bg-[#1D5149] disabled:opacity-55 flex items-center justify-center gap-2">
          {loading && <Icons.Loader s={16} />} {loading ? 'Verificando…' : 'Iniciar sesión'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-[#60716C]">¿Aún no tienes cuenta?{' '}
        <button type="button" disabled={loading} onClick={onRegister} className="font-bold text-[#24685F] hover:text-[#1D5149]">Crear cuenta</button>
      </p>
    </AuthLayout>
  );
}
