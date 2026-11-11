import { Badge } from '../components/ui';
import { Icons } from '../components/icons';
import { EmptyState, StatCard } from '../components/StudentUI';
import type { BookingLedger } from '../data/booking';
import { useEffect, useRef } from 'react';
import { ACADEMIC_CREDIT_CONFIG } from '../data/creditConfig';

const movementLabels = {
  initial_grant: 'Créditos iniciales',
  hold: 'Reserva',
  release: 'Liberación',
  spent: 'Utilizado',
  earning: 'Obtenido enseñando',
  refund: 'Devolución',
} as const;

export default function CreditsHubPage({ state }: { state: BookingLedger }) {
  const movements = state.movements
    .filter(item => (!item.userId || item.userId === state.studentId))
    .map(item => ({ ...item, date: new Date(item.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima' }), concept: item.type === 'initial_grant' ? 'Créditos iniciales por verificación' : `${movementLabels[item.type]} de ${state.sessions.find(session => session.id === item.sessionId)?.skill ?? 'sesión'}` }));
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const stats: Array<[string, number, typeof Icons.Coin]> = [
    ['Disponibles', state.wallet.available, Icons.Coin],
    ['Reservados', state.wallet.held, Icons.Clock],
    [state.serverManaged ? 'Total' : 'Utilizados al aprender', state.serverManaged ? state.wallet.total ?? 0 : state.wallet.used, Icons.TrendingUp],
    ['Obtenidos enseñando', state.wallet.earned, Icons.Award],
  ];

  return (
    <main className="max-w-[1160px] mx-auto px-4 md:px-8 py-8 md:py-12 text-[#17312D]">
      <section className="rounded-[24px] bg-[#DDF6ED] border border-[#BFE8D9] p-5 sm:p-7 md:p-9">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#176B5B]">Billetera académica</p>
        <h1 ref={heading} tabIndex={-1} className="mt-2 text-3xl md:text-4xl font-extrabold">Mis créditos</h1>
        <p className="mt-2 text-[#64748B]">Créditos académicos de intercambio, sin valor monetario y no transferibles entre usuarios.</p>
      </section>

      <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-8" aria-label="Resumen de créditos">
        {stats.map(([label, value, Icon], index) => (
          <StatCard key={label} icon={<Icon s={20} />} label={label} value={value} tone={(['sage', 'sand', 'white', 'peach'] as const)[index]} />
        ))}
      </section>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 mt-8">
        <section className="rounded-[20px] border border-[#E4EBE7] bg-white overflow-hidden">
          <div className="p-5 border-b border-[#E4EBE7]">
            <p className="text-xl font-bold">Historial de movimientos</p>
            <p className="mt-1 text-sm text-[#64748B]">Cada reserva, devolución y sesión completada conserva una referencia estable.</p>
            <p className="mt-2 text-xs leading-5 text-[#64748B]">La reserva retiene créditos. Al completar la sesión, esa retención se aplica al movimiento utilizado; no es un segundo cargo.</p>
          </div>
          {movements.length ? (
            <div className="overflow-x-auto" role="region" aria-label="Historial de movimientos" tabIndex={0}>
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-[#FAFBF8] text-[#64748B]">
                  <tr><th scope="col" className="text-left p-4">Fecha</th><th scope="col" className="text-left p-4">Concepto</th><th scope="col" className="text-left p-4">Tipo</th><th scope="col" className="text-left p-4">Créditos</th><th scope="col" className="text-left p-4">Estado</th></tr>
                </thead>
                <tbody>{movements.map(item => (
                  <tr key={item.id} className="border-t border-[#E4EBE7]">
                    <td className="p-4 whitespace-nowrap">{item.date}</td>
                    <td className="p-4"><p className="font-semibold">{item.concept}</p><p className="text-xs text-[#64748B] break-all">{item.reference}</p></td>
                    <td className="p-4">{movementLabels[item.type as keyof typeof movementLabels]}</td>
                    <td className={`p-4 font-bold ${item.amount >= 0 ? 'text-[#176B5B]' : 'text-[#B54747]'}`}>{item.amount >= 0 ? '+' : ''}{item.amount}</td>
                    <td className="p-4"><Badge variant={item.status === 'completed' ? 'success' : item.status === 'pending' ? 'warning' : 'danger'}>{item.status === 'completed' ? 'Completado' : item.status === 'pending' ? 'Reservado' : 'Rechazado'}</Badge></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <div className="p-6"><EmptyState icon={<Icons.Coin s={28} />} title="Todavía no tienes movimientos" description="Tus reservas, sesiones y devoluciones aparecerán aquí." /></div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-[20px] border border-[#E4EBE7] bg-white p-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#176B5B]">Reglas provisionales</p>
            <h2 className="mt-2 text-xl font-bold">Uso académico</h2>
            <div className="mt-5 divide-y divide-[#E4EBE7] text-sm">
              {(Object.entries(ACADEMIC_CREDIT_CONFIG.sessionCosts) as Array<[string, number]>).map(([duration, credits]) => (
                <div key={duration} className="py-3 flex justify-between"><span>{duration} minutos</span><strong>{credits} créditos</strong></div>
              ))}
            </div>
          </section>
          <div className="rounded-[20px] bg-[#E8F4FF] border border-[#D6E9F8] p-6">
            <Icons.Shield s={21} c="text-[#176B5B]" />
            <p className="mt-4 font-bold">Sin operaciones monetarias</p>
            <p className="mt-2 text-sm leading-6 text-[#64748B]">El saldo inicial se entrega una sola vez a cada cuenta verificada. Los créditos no se compran, no se retiran y no se convierten en dinero.</p>
          </div>
          <div className="rounded-[20px] bg-[#FFF4D6] border border-[#F3E4B9] p-6">
            <Icons.Award s={21} c="text-[#176B5B]" />
            <p className="mt-4 font-bold">Reconocimiento al mentor</p>
            <p className="mt-2 text-sm leading-6 text-[#64748B]">Cuando el mentor y el estudiante confirman que la sesión se realizó, el mentor recibe el 100 % de su costo en créditos académicos.</p>
          </div>
        <div className="rounded-[20px] bg-[#F7F7F2] border border-[#E4EBE7] p-6"><h2 className="font-bold">Cancelaciones</h2><p className="mt-2 text-sm leading-6 text-[#64748B]">Puedes cancelar una reserva próxima con al menos 12 horas de anticipación para recuperar los créditos retenidos. Si hay una discrepancia, permanecen retenidos hasta la revisión administrativa.</p></div>
        </aside>
      </div>
    </main>
  );
}
