import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button } from '../components/ui';
import { PublicLogo } from '../components/PublicChrome';
import { EmptyState } from '../components/StudentUI';
import { Icons } from '../components/icons';
import { BookingError, isBookingSlotAvailable, type BookingContext, type BookingDraft, type BookingResult, type ConfirmedBooking } from '../data/booking';
import { academicSessionCost as sessionCost, type SessionDuration } from '../data/creditConfig';
import { isEligibleMentor } from '../data/recommendations';
import { dayNameFromISO, formatSessionDate, formatSessionTime, getNextAvailableDates } from '../data/scheduling';
import type { StudentService } from '../services/student';
import { bookingReceiptMessage } from '../data/bookingReceipt';

type Step = 'schedule' | 'duration' | 'confirm' | 'success';
type Actions = { onBack: () => void; onBuyCredits: () => void; onSessions: () => void; onHome: () => void };

function BookingSuccess({ session, onSessions, onHome }: { session: ConfirmedBooking; onSessions: () => void; onHome: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const formattedDate = formatSessionDate(session.date);
  const formattedTime = formatSessionTime(session.time);
    return (
      <main className="public-page min-h-screen bg-[#F7F7F2] flex items-center justify-center p-4 text-[#182B2A]">
        <section className="w-full max-w-2xl rounded-[24px] border border-[#E2E8E0] bg-white p-8 md:p-12 text-center shadow-sm">
          <div className="w-16 h-16 mx-auto rounded-full bg-[#DCEBDD] text-[#24685F] flex items-center justify-center"><Icons.Check s={30} /></div>
          <h1 ref={heading} tabIndex={-1} className="mt-5 text-3xl font-extrabold">{session.status === 'cancelled' ? 'Reserva cancelada' : session.status === 'completed' ? 'Sesión completada' : 'Reserva confirmada'}</h1>
          <p className="mt-3 break-words text-[#60716C]">{bookingReceiptMessage(session)}</p>
          {session.adminResolution && <p className="mt-2 text-sm text-[#60716C]">Decisión del {new Date(session.adminResolution.at).toLocaleString('es-PE', { timeZone: 'America/Lima' })}.</p>}
          <div className="mt-6 rounded-2xl bg-[#F7F7F2] p-5 text-left">
            <p className="font-bold">{session.skill} con {session.mentorName}</p>
            <p className="mt-2 text-sm text-[#60716C]">{formattedDate} · {formattedTime} · {session.duration} minutos</p>
            <p className="mt-1 text-sm text-[#60716C]">{session.credits} créditos {session.status === 'cancelled' ? 'devueltos' : session.status === 'completed' ? 'utilizados' : 'retenidos'} · Mentoría virtual · Enlace pendiente</p>
          </div>
          <div className="mt-7 flex flex-col sm:flex-row justify-center gap-3">
            <Button size="lg" onClick={onSessions}>Ver mis sesiones</Button>
            <Button size="lg" variant="outline" onClick={onHome}>Volver al panel</Button>
          </div>
        </section>
      </main>
    );
}

function firstTime(context: BookingContext, date: string, duration: number): string {
  return (context.mentor.slots[dayNameFromISO(date)] ?? []).find(time => isBookingSlotAvailable(context, date, time, duration)) ?? '';
}

function BookingWizard({ initialContext, draft, service, onConfirmed, onBack, onBuyCredits, onSessions, onHome }: Actions & {
  initialContext: BookingContext; draft: BookingDraft | null; service: StudentService; onConfirmed: (result: BookingResult) => void;
}) {
  const [context, setContext] = useState(initialContext);
  const { mentor, studentId, wallet } = context;
  const balance = wallet.available;
  const dates = useMemo(() => getNextAvailableDates(mentor.slots), [mentor.slots]);
  const initialDate = draft?.date ?? dates[0] ?? '';
  const initialDuration = draft?.duration ?? mentor.offer.durations[0] ?? 30;
  const [step, setStep] = useState<Step>(draft?.step && draft.step !== 'success' ? draft.step : 'schedule');
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(() => draft?.time ?? firstTime(initialContext, initialDate, initialDuration));
  const [duration, setDuration] = useState<SessionDuration>(initialDuration);
  const [bookingId] = useState(() => draft?.id ?? `SES-${crypto.randomUUID()}`);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const credits = sessionCost(duration);
  const day = dayNameFromISO(date);
  const dateSlots = mentor.slots[day] ?? [];
  const slotIsAvailable = (candidate: string, candidateDuration = duration) => isBookingSlotAvailable(context, date, candidate, candidateDuration);
  const unavailable = !date || !time || !slotIsAvailable(time);
  const enough = balance >= credits;
  const canBookMentor = isEligibleMentor(mentor, studentId) && mentor.offer.durations.includes(duration);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => { void service.saveBookingDraft({ id: bookingId, mentorId: mentor.id, date, time, duration, step }); }, [service, bookingId, mentor.id, date, time, duration, step]);

  const chooseDate = (nextDate: string) => {
    const nextDuration = mentor.offer.durations.find(item => item === duration && firstTime(context, nextDate, item))
      ?? mentor.offer.durations.find(item => firstTime(context, nextDate, item)) ?? duration;
    setDate(nextDate); setDuration(nextDuration); setTime(firstTime(context, nextDate, nextDuration)); setError('');
  };
  const chooseTime = (nextTime: string) => {
    setTime(nextTime);
    if (!slotIsAvailable(nextTime)) setDuration(mentor.offer.durations.find(item => slotIsAvailable(nextTime, item)) ?? duration);
    setError('');
  };
  const confirm = async () => {
    if (inFlight.current) return;
    setError('');
    if (!canBookMentor) return setError('Esta oferta no está disponible para reservar.');
    if (unavailable) return setError('Este horario ya no está disponible. Selecciona otro.');
    if (!enough) return setError('No tienes suficientes créditos para esta sesión.');
    inFlight.current = true; setConfirming(true);
    try {
      const result = await service.confirmBooking({ id: bookingId, mentorId: mentor.id, date, time, duration });
      if (!mounted.current) return;
      setConfirmed(result.session); setStep('success'); onConfirmed(result);
    } catch (cause) {
      if (!mounted.current) return;
      setError(cause instanceof BookingError ? cause.message : 'No pudimos confirmar la reserva. Vuelve a intentarlo.');
      try {
        const latest = await service.getBookingContext(mentor.id);
        if (mounted.current) setContext(latest ?? { ...context, mentor: { ...mentor, active: false } });
      } catch { /* Conserva la selección y permite reintentar con el mismo identificador. */ }
    } finally { inFlight.current = false; if (mounted.current) setConfirming(false); }
  };
  const formattedDate = date ? formatSessionDate(date) : 'Sin fecha';
  const formattedTime = time ? formatSessionTime(time) : 'Sin elegir';
  const stepNumber = step === 'schedule' ? 1 : step === 'duration' ? 2 : 3;
  if (confirmed) return <BookingSuccess session={confirmed} onSessions={onSessions} onHome={onHome} />;

  return (
    <main className="public-page min-h-screen bg-[#F7F7F2] text-[#182B2A]">
      <header className="h-[72px] bg-white border-b border-[#E2E8E0] px-4 md:px-8 flex items-center">
        <PublicLogo />
        <Button disabled={confirming} variant="ghost" className="ml-auto" onClick={step === 'schedule' ? onBack : () => setStep(step === 'confirm' ? 'duration' : 'schedule')} icon={<Icons.ChevLeft s={16} />}>Volver</Button>
      </header>
      <div className="max-w-[1120px] mx-auto px-4 md:px-6 py-8 md:py-12">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#24685F]">Reserva · Paso {stepNumber} de 3</p>
        <h1 ref={heading} tabIndex={-1} className="mt-2 text-3xl md:text-4xl font-extrabold">{step === 'schedule' ? 'Elige fecha y horario' : step === 'duration' ? 'Elige la duración' : 'Revisa y confirma'}</h1>
        <div role="progressbar" aria-label="Pasos de la reserva" aria-valuemin={0} aria-valuemax={3} aria-valuenow={stepNumber} className="mt-5 h-2 bg-[#E2E8E0] rounded-full overflow-hidden"><div className="h-full bg-[#34877A] transition-[width] motion-reduce:transition-none" style={{ width: `${stepNumber * 33.333}%` }} /></div>

        <div className="grid lg:grid-cols-[1fr_350px] gap-6 mt-7">
          <section aria-busy={confirming} className="min-w-0 rounded-[20px] border border-[#E2E8E0] bg-white p-5 sm:p-6">
            {step === 'schedule' && (
              <>
                {!canBookMentor && <p className="mb-5 rounded-xl bg-[#FDECEC] p-4 text-sm text-[#A43838]">Esta habilidad no está aprobada, la oferta está inactiva o pertenece a tu propia cuenta.</p>}
                <h2 className="text-lg font-bold">Fecha</h2>
                {dates.length ? (
                  <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
                    {dates.map(item => <Button key={item} variant={date === item ? 'secondary' : 'outline'} aria-pressed={date === item} onClick={() => chooseDate(item)} className="flex-shrink-0">{formatSessionDate(item, { weekday: 'short', day: 'numeric', month: 'short' })}</Button>)}
                  </div>
                ) : <p className="mt-3 rounded-xl bg-[#F2E8D7] p-4 text-sm text-[#6B5836]">Este mentor no tiene fechas disponibles.</p>}
                <h2 className="mt-7 text-lg font-bold">Horario · America/Lima</h2>
                <div className="flex flex-wrap gap-2 mt-3">
                  {dateSlots.map(item => {
                    const available = mentor.offer.durations.some(itemDuration => slotIsAvailable(item, itemDuration));
                    return <Button key={item} disabled={!available} variant={time === item ? 'secondary' : 'outline'} aria-pressed={time === item} onClick={() => chooseTime(item)}>{item}{available ? '' : ' · Ocupado'}</Button>;
                  })}
                </div>
                {!dateSlots.length && <p className="mt-3 text-sm text-[#60716C]">No hay horarios para esta fecha.</p>}
                <Button size="lg" className="mt-8" disabled={unavailable || !canBookMentor} onClick={() => setStep('duration')}>Continuar</Button>
              </>
            )}

            {step === 'duration' && (
              <>
                <h2 className="text-lg font-bold">¿Cuánto tiempo necesitas?</h2>
                <p className="mt-2 text-sm text-[#60716C]">Elige la duración que mejor se adapte a lo que quieres aprender.</p>
                <div className="grid sm:grid-cols-3 gap-3 mt-6">
                  {mentor.offer.durations.map(item => {
                    const available = slotIsAvailable(time, item);
                    return <button type="button" key={item} aria-pressed={duration === item} disabled={!available} onClick={() => setDuration(item)} className={`min-h-28 rounded-2xl border p-4 text-left transition-colors ${duration === item ? 'bg-[#DCEBDD] border-[#34877A]' : 'bg-white border-[#CBD8CE]'} disabled:opacity-40 disabled:cursor-not-allowed`}><span className="text-xl font-bold">{item} min</span><span className="block mt-2 text-sm text-[#60716C]">{sessionCost(item)} créditos</span></button>;
                  })}
                </div>
                <Button size="lg" className="mt-8" disabled={!slotIsAvailable(time)} onClick={() => setStep('confirm')}>Revisar reserva</Button>
              </>
            )}

            {step === 'confirm' && (
              <>
                <div className="flex flex-wrap items-center gap-4 pb-5 border-b border-[#E2E8E0]">
                  <img src={mentor.image} alt={`Foto de ${mentor.name}`} className="w-16 h-16 rounded-2xl object-cover object-top" />
                  <div><p className="font-bold text-lg">{mentor.name}</p><p className="text-sm text-[#60716C]">{mentor.skill} · {mentor.offer.topic} · {mentor.level}</p></div>
                  <Badge variant="success"><Icons.Check s={12} /> Aprobada</Badge>
                </div>
                {!enough && <div className="mt-5 rounded-xl bg-[#FDECEC] p-4 text-sm text-[#A43838]"><strong>Te faltan {credits - balance} créditos.</strong><Button full className="mt-3" onClick={onBuyCredits}>Ver mis créditos</Button></div>}
                {unavailable && <p className="mt-5 rounded-xl bg-[#FDECEC] p-4 text-sm text-[#A43838]">La disponibilidad cambió. Vuelve y elige otro horario.</p>}
                {error && <p className="mt-5 text-sm text-[#A43838]" role="alert">{error}</p>}
                <Button full size="lg" className="mt-6" disabled={confirming || !enough || unavailable || !canBookMentor} onClick={() => void confirm()}>{confirming ? 'Confirmando…' : 'Confirmar reserva'}</Button>
              </>
            )}
          </section>

          <aside className="rounded-[20px] border border-[#E2E8E0] bg-[#F2E8D7] p-6 h-fit lg:sticky lg:top-24">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#6B5836]">Resumen</p>
            <div className="mt-4 flex items-center gap-3">
              <img src={mentor.image} alt="" className="w-12 h-12 rounded-xl object-cover object-top" />
              <div><p className="font-bold">{mentor.name}</p><p className="text-xs text-[#60716C]">{mentor.skill}</p></div>
            </div>
            <dl className="mt-5 divide-y divide-[#E0D1B7] text-sm">
              {[['Fecha', formattedDate], ['Hora', formattedTime], ['Duración', `${duration} minutos`], ['Créditos', String(credits)], ['Saldo disponible', String(balance)], ['Saldo al confirmar', String(Math.max(0, balance - credits))]].map(([label, value]) => <div key={label} className="py-3 flex justify-between gap-4"><dt className="text-[#60716C]">{label}</dt><dd className="font-bold text-right">{value}</dd></div>)}
            </dl>
            <p className="mt-4 text-xs leading-5 text-[#6B6F68]">Los créditos se retendrán al confirmar la reserva. La sesión se realizará de forma virtual.</p>
          </aside>
        </div>
      </div>
    </main>
  );
}

type Load = { status: 'loading' } | { status: 'ready'; context: BookingContext } | { status: 'receipt'; session: ConfirmedBooking } | { status: 'missing' | 'error' };
export default function BookingFlowPage({ mentorId, draft, service, onConfirmed, ...actions }: Actions & {
  mentorId: string; draft: BookingDraft | null; service: StudentService; onConfirmed: (result: BookingResult) => void;
}) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true;
    const loadBooking = async () => {
      try {
        const receipt = draft ? await service.getBooking(draft.id) : null;
        if (!active) return;
        if (receipt) { setLoad({ status: 'receipt', session: receipt }); return; }
        const context = await service.getBookingContext(mentorId);
        if (active) setLoad(context ? { status: 'ready', context } : { status: 'missing' });
      } catch { if (active) setLoad({ status: 'error' }); }
    };
    void loadBooking();
    return () => { active = false; };
  }, [mentorId, draft, service, attempt]);
  useEffect(() => { heading.current?.focus(); }, [load]);
  if (load.status === 'receipt') return <BookingSuccess session={load.session} onSessions={actions.onSessions} onHome={actions.onHome} />;
  if (load.status === 'ready') return <BookingWizard initialContext={load.context} draft={draft} service={service} onConfirmed={onConfirmed} {...actions} />;
  return <main className="public-page min-h-screen bg-[#F7F7F2] p-5 text-[#182B2A]"><div className="mx-auto max-w-[1120px]">
    <Button variant="ghost" onClick={actions.onBack}>Volver</Button>
    {load.status === 'loading' ? <p role="status" className="mt-8">Cargando disponibilidad…</p> : <section className="mt-8">
      <h1 ref={heading} tabIndex={-1} className="sr-only">{load.status === 'missing' ? 'Oferta no disponible' : 'No pudimos cargar la reserva'}</h1>
      <EmptyState title={load.status === 'missing' ? 'Oferta no disponible' : 'No pudimos cargar la reserva'} description="Vuelve al perfil del mentor o inténtalo nuevamente." action="Reintentar" onAction={() => { setLoad({ status: 'loading' }); setAttempt(current => current + 1); }} />
    </section>}
  </div></main>;
}
