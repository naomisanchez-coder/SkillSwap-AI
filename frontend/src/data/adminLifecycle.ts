import { BookingError, type BookingLedger } from './booking';
import { adminIdentity, auditRecord, isOpenIncident, type AdminActivityAction } from './admin';
import { sessionMentorOwner } from './mentor';

/** Resoluciones de Make: una decisión administrativa puede liquidar una discrepancia.
 * Se registra como excepción explícita, sin falsificar las confirmaciones de las partes. */
export function transitionAdmin(source: BookingLedger, command: AdminActivityAction, knownUsers: string[], now = new Date()): BookingLedger {
  const fail = (message: string): never => { throw new BookingError('invalid_admin_action', message); };
  const next = structuredClone(source); next.adminAuditLog ??= []; next.suspendedUserIds ??= [];
  const audit = (action: Parameters<typeof auditRecord>[0], entity: Parameters<typeof auditRecord>[1], id: string, detail: string) => next.adminAuditLog!.unshift(auditRecord(action, entity, id, detail, now));
  if (command.type === 'suspension') {
    if (!knownUsers.includes(command.userId) || command.userId === adminIdentity.id || typeof command.suspended !== 'boolean') return fail('La cuenta no admite esta acción.');
    if (next.suspendedUserIds.includes(command.userId) === command.suspended) return source;
    next.suspendedUserIds = command.suspended ? [...next.suspendedUserIds, command.userId] : next.suspendedUserIds.filter(id => id !== command.userId);
    audit(command.suspended ? 'account_suspended' : 'account_reactivated', 'user', command.userId, command.suspended ? 'Cuenta suspendida' : 'Cuenta reactivada');
    return next;
  }
  const incident = next.incidents.find(item => item.id === command.id);
  if (!incident) return fail('No encontramos esta incidencia.');
  if (command.type === 'review') {
    if (incident.status === 'in_review') return source;
    if (incident.status !== 'open') return fail('La incidencia ya tiene una decisión.');
    incident.status = 'in_review'; audit('incident_reviewed', 'incident', incident.id, 'Incidencia tomada para revisión administrativa.'); return next;
  }
  const comment = typeof command.comment === 'string' ? command.comment.trim() : '';
  if (!['refund', 'release', 'no_adjustment'].includes(command.resolution) || !comment || comment.length > 2000) return fail('Indica una resolución y su motivo, de hasta 2000 caracteres.');
  if (!isOpenIncident(incident)) {
    if (incident.resolution === command.resolution && incident.resolutionComment === comment) return source;
    return fail('La incidencia ya tiene una resolución diferente.');
  }
  const session = next.sessions.find(item => item.id === incident.sessionId);
  if (!session || session.status !== 'review' || next.incidents.filter(item => item.sessionId === session.id && isOpenIncident(item)).length !== 1) return fail('La sesión no está disponible para resolver esta incidencia.');
  const at = now.toISOString();
  if (command.resolution !== 'no_adjustment') {
    const hold = next.movements.find(item => item.reference === `${session.id}:hold`);
    const wallet = session.studentId === next.studentId ? next.wallet : next.wallets?.[session.studentId];
    if (!wallet || wallet.held < session.credits || hold?.status !== 'pending' || next.movements.some(item => item.sessionId === session.id && item.type !== 'hold')) return fail('Los créditos ya fueron ajustados o no se pudo verificar su retención.');
    wallet.held -= session.credits;
    if (command.resolution === 'refund') {
      wallet.available += session.credits; hold.status = 'rejected';
      session.status = 'cancelled'; session.cancelledAt = at; session.cancellationReason = 'Incidencia resuelta con reembolso.'; session.refundStatus = `${session.credits} créditos devueltos`;
      next.movements.unshift({ id: `MOV-${session.id}-incident-refund`, sessionId: session.id, reference: `${session.id}:incident-refund`, type: 'refund', amount: session.credits, status: 'completed', createdAt: at, userId: session.studentId });
    } else {
      wallet.used += session.credits; hold.status = 'completed'; session.status = 'completed'; session.completedAt = at;
      session.adminResolution = { incidentId: incident.id, at, adminId: adminIdentity.id };
      const owner = sessionMentorOwner(session); const mentorWallet = owner === next.studentId ? next.wallet : next.wallets?.[owner];
      if (mentorWallet) { mentorWallet.available += session.credits; mentorWallet.earned += session.credits; }
      next.mentorBalances[session.mentorId] = (next.mentorBalances[session.mentorId] ?? 0) + session.credits;
      for (const type of ['spent', 'earning'] as const) next.movements.unshift({ id: `MOV-${session.id}-${type}`, reference: `${session.id}:${type}`, sessionId: session.id, type, amount: type === 'spent' ? -session.credits : session.credits, status: 'completed', createdAt: at, userId: type === 'spent' ? session.studentId : owner });
    }
  } else session.status = session.performedAt ? 'validation' : 'upcoming';
  incident.status = command.resolution === 'no_adjustment' ? 'closed' : 'resolved';
  incident.resolution = command.resolution; incident.resolutionComment = comment; incident.resolvedAt = at; incident.resolvedBy = adminIdentity.name;
  session.history ??= [{ id: `${session.id}:booked`, at: session.createdAt, label: 'Reserva confirmada', actor: 'system' }];
  session.history.push({ id: `${incident.id}:resolved`, at, label: `Resolución administrativa: ${command.resolution} · ${comment}`, actor: 'system' });
  const detail = `${command.resolution === 'refund' ? 'Devolución al estudiante' : command.resolution === 'release' ? 'Liberación al mentor' : 'Cierre sin ajuste'}: ${comment}`;
  for (const [id, target, suffix] of [[session.studentId, 'sessions', 'student'], [sessionMentorOwner(session), 'mentor-sessions', 'mentor']] as const) next.notifications.unshift({ id: `NOT-${incident.id}-resolved-${suffix}`, userId: id, title: 'Incidencia resuelta', description: detail, date: 'Ahora', read: false, target, sessionId: session.id });
  audit('incident_resolved', 'incident', incident.id, detail);
  return next;
}
