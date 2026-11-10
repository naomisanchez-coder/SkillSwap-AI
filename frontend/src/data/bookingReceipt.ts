import type { ConfirmedBooking } from './booking';

export function bookingReceiptMessage(session: ConfirmedBooking): string {
  if (session.status === 'cancelled') return 'Los créditos se devolvieron a tu saldo disponible.';
  if (session.status === 'completed') {
    if (session.adminResolution) return `Los créditos se liberaron al mentor por decisión administrativa. Incidencia: ${session.adminResolution.incidentId}.`;
    if (session.performedAt && session.validatedAt) return 'Ambos participantes confirmaron y los créditos se liberaron al mentor.';
    return 'La sesión está completada. No hay constancia de doble confirmación en este registro.';
  }
  if (session.status === 'review') return 'La sesión está pendiente de revisión administrativa. Los créditos siguen retenidos.';
  return 'Los créditos quedaron retenidos y tu horario está reservado.';
}
