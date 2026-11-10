import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AuthField } from '../components/AuthFields';
import { Icons } from '../components/icons';
import { passwordRecoveryService, type PasswordRecoveryService } from '../services/passwordRecovery';

/** PasswordRecoveryForm de AuthPage.tsx de Figma Make, dentro del AuthLayout existente. */
export default function PasswordRecoveryForm({ initialEmail, onBack, service = passwordRecoveryService }: {
  initialEmail: string; onBack: () => void; service?: PasswordRecoveryService;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serviceError, setServiceError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const request = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  useEffect(() => { heading.current?.focus(); return () => request.current?.abort(); }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setLoading(true); setChecked(false); setError(''); setServiceError('');
    const controller = new AbortController(); request.current = controller;
    try {
      const result = await service.submit(email, controller.signal);
      if (controller.signal.aborted) return;
      if (result.status === 'invalid') {
        setError(result.message);
        requestAnimationFrame(() => form.current?.querySelector<HTMLInputElement>('input')?.focus());
      } else { setEmail(result.email); setChecked(true); }
    } catch {
      if (!controller.signal.aborted) setServiceError('No pudimos comprobar el correo. Inténtalo nuevamente. No se ha enviado ningún correo.');
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  return <>
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#24685F]">Acceso a tu cuenta</p>
      <h2 ref={heading} tabIndex={-1} className="mt-3 text-3xl md:text-4xl font-bold tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Recuperar contraseña</h2>
      <p className="mt-3 text-[#60716C]">Introduce tu correo institucional TECSUP para comprobar su formato.</p>
    </div>
    <p className="mt-5 rounded-2xl border border-[#D5C7AE] bg-[#F8F0E2] p-4 text-sm leading-6 text-[#725D3B]">La recuperación de contraseña está pendiente de integración con el servicio de correo. Por ahora puedes comprobar el formato de tu correo institucional; no se enviará ningún mensaje.</p>
    <form ref={form} onSubmit={submit} noValidate aria-busy={loading} className="mt-8 space-y-5">
      <AuthField id="recovery-email" label="Correo institucional" type="email" value={email}
        onChange={value => { setEmail(value); setError(''); setChecked(false); setServiceError(''); }}
        placeholder="sheila.diaz@tecsup.edu.pe" autoComplete="email" maxLength={254} disabled={loading}
        error={error} helper="Usa nombre.apellido@tecsup.edu.pe, con un solo punto y únicamente letras antes del dominio." icon={<Icons.Mail s={17} />} />
      {checked && <p role="status" className="rounded-xl border border-[#C9D4CC] bg-[#DCEBDD] px-4 py-3 text-sm text-[#24685F]">El formato del correo institucional es válido. La recuperación sigue pendiente de integración. No se ha enviado ningún correo.</p>}
      {serviceError && <p role="alert" className="rounded-xl border border-[#E8C2C2] bg-[#FFF3F0] px-4 py-3 text-sm text-[#B54747]">{serviceError}</p>}
      <button type="submit" disabled={loading} className="w-full min-h-12 rounded-xl bg-[#24685F] text-white font-bold hover:bg-[#1D5149] disabled:opacity-55">{loading ? 'Comprobando…' : 'Comprobar correo'}</button>
    </form>
    <button type="button" onClick={onBack} className="mt-6 min-h-10 text-sm font-bold text-[#24685F] hover:text-[#1D5149]">Volver a iniciar sesión</button>
  </>;
}
