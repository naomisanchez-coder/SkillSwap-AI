import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icons } from '../components/icons';
import { PublicLogo } from '../components/PublicChrome';
import { pendingEmailVerification, type EmailVerificationService, type VerificationStatus } from '../services/emailVerification';

const copy: Record<VerificationStatus, [string, string, string]> = {
  pending: ['Pendiente de verificación', 'Genera un código local para revisar la verificación.', 'bg-[#FFF4D6] text-[#725D3B]'],
  code_sent: ['Código local disponible', 'El código de prueba vence en cinco minutos.', 'bg-[#E8F4FF] text-[#285E86]'],
  incorrect: ['Código incorrecto', 'El código ingresado no coincide. Revisa el código local.', 'bg-[#FDECEC] text-[#B54747]'],
  expired: ['Código expirado', 'El código superó su vigencia. Genera uno nuevo para continuar.', 'bg-[#FDECEC] text-[#B54747]'],
  verified: ['Comprobación local completada', 'El código local es correcto. Puedes continuar con el perfil de desarrollo.', 'bg-[#DDF6ED] text-[#176B5B]'],
  service_error: ['Error de servicio', 'No fue posible completar la comprobación. Intenta nuevamente.', 'bg-[#FDECEC] text-[#B54747]'],
  integration_pending: ['Integración pendiente', 'La verificación y el reenvío están pendientes del contrato de la API. No se ha enviado ningún correo ni verificado tu cuenta.', 'bg-[#FFF4D6] text-[#725D3B]'],
};
/** EmailVerificationPage del Make original. La fuente de estados se inyecta desde la composición. */
export default function EmailVerificationPage({ email, onBackToLogin, onHome, onVerified, service = pendingEmailVerification }: {
  email: string; onBackToLogin: () => void; onHome: () => void; onVerified?: () => void | Promise<void>; service?: EmailVerificationService;
}) {
  const [status, setStatus] = useState<VerificationStatus>(service.mode === 'local' ? 'pending' : 'integration_pending');
  const [code, setCode] = useState(''); const [fixtureCode, setFixtureCode] = useState('');
  const [expiresAt, setExpiresAt] = useState(0); const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null); const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null); const input = useRef<HTMLInputElement>(null);
  useEffect(() => { heading.current?.focus(); return () => request.current?.abort(); }, []);
  useEffect(() => {
    if (!expiresAt || ['verified', 'integration_pending'].includes(status)) return;
    const expire = () => { if (Date.now() >= expiresAt) setStatus('expired'); };
    expire(); const timer = window.setInterval(expire, 1000); return () => clearInterval(timer);
  }, [expiresAt, status]);
  const run = async (action: 'issue' | 'verify' | 'continue') => {
    if (inFlight.current || service.mode !== 'local') return;
    inFlight.current = true; setBusy(true);
    const controller = new AbortController(); request.current = controller;
    try {
      if (action === 'continue') { await onVerified?.(); return; }
      const result = action === 'issue' ? await service.issue(email, controller.signal) : await service.verify(email, code, controller.signal);
      if (controller.signal.aborted) return;
      setStatus(result.status);
      if (action === 'issue') { setCode(''); setFixtureCode(result.code ?? ''); setExpiresAt(result.expiresAt ?? 0); }
      requestAnimationFrame(() => { if (result.status === 'code_sent' || result.status === 'incorrect') input.current?.focus(); else heading.current?.focus(); });
    } catch { if (!controller.signal.aborted) setStatus('service_error'); }
    finally { inFlight.current = false; if (!controller.signal.aborted) setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (code.length === 6) void run('verify'); };
  const [label, message, tone] = copy[status]; const local = service.mode === 'local';
  return <main className="min-h-screen bg-[#F7F7F2] text-[#182B2A] px-4 py-8 flex flex-col">
    <div className="max-w-[1120px] w-full mx-auto"><button type="button" onClick={onHome} aria-label="Ir al inicio"><PublicLogo /></button></div>
    <div className="flex-1 flex items-center justify-center py-10">
      <section aria-busy={busy} className="w-full max-w-xl rounded-[28px] border border-[#DFE6DF] bg-white p-7 md:p-10 shadow-xl text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-[#DCE9DD] text-[#24685F] flex items-center justify-center"><Icons.Mail s={28} /></div>
        <span className={`inline-flex mt-6 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] ${tone}`}>{label}</span>
        <h1 ref={heading} tabIndex={-1} className="mt-4 text-3xl font-bold tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Verifica tu correo institucional</h1>
        <p id="verification-message" role={['incorrect', 'expired', 'service_error'].includes(status) ? 'alert' : 'status'} className="mt-4 leading-7 text-[#60716C]">{message}</p>
        <p className="mt-2 font-bold break-all">{email}</p>
        {local && <div className="mt-6 rounded-2xl bg-[#FFF8EE] border border-[#E9DCC6] p-4 text-left text-sm leading-6 text-[#6C5A3C]">Entorno local de desarrollo. No se envían correos ni se verifica una cuenta real. El código y el resultado solo sirven para revisar esta interfaz.</div>}
        {status === 'verified' ? <button type="button" disabled={busy} onClick={() => void run('continue')} className="mt-7 w-full min-h-12 rounded-xl bg-[#24685F] text-white font-bold disabled:opacity-50">Continuar con el perfil</button> : <>
          {fixtureCode && <form onSubmit={submit} noValidate>
            <div className="mt-6 rounded-2xl border border-[#B8C9BD] bg-[#F7F7F2] p-4"><p className="text-xs font-bold uppercase tracking-[0.08em] text-[#60716C]">Código local de prueba</p><code className="mt-2 block text-2xl font-bold tracking-[0.25em] text-[#24685F]">{fixtureCode}</code></div>
            <label htmlFor="verification-code" className="block mt-5 text-left text-sm font-bold">Código de seis dígitos</label>
            <input ref={input} id="verification-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} disabled={busy} aria-invalid={status === 'incorrect'} aria-describedby="verification-message" onChange={event => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); if (status === 'incorrect') setStatus('code_sent'); }} className="mt-2 w-full h-12 rounded-xl border border-[#C9D4CC] px-4 text-center text-lg tracking-[0.2em] focus:outline-none focus:ring-2 focus:ring-[#B9D2C4]" />
            <button type="submit" disabled={busy || code.length !== 6 || status === 'expired'} className="mt-4 w-full min-h-12 rounded-xl bg-[#24685F] text-white font-bold hover:bg-[#1D5149] disabled:opacity-50">{busy ? 'Confirmando…' : 'Verificar código local'}</button>
          </form>}
          <button type="button" disabled={!local || busy} onClick={() => void run('issue')} className="mt-7 w-full min-h-12 rounded-xl border border-[#B8C9BD] text-sm font-bold text-[#24685F] hover:bg-[#F7F7F2] disabled:opacity-50">{fixtureCode ? 'Reenviar código local' : local ? 'Generar código local' : 'Reenvío pendiente de integración'}</button>
        </>}
        <button type="button" onClick={onBackToLogin} className="mt-3 w-full min-h-11 rounded-xl text-sm font-bold text-[#60716C] hover:bg-[#F7F7F2]">Volver a iniciar sesión</button>
      </section>
    </div>
  </main>;
}
