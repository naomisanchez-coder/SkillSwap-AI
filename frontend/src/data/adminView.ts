import { adminIdentity, isOpenIncident, type AdminSnapshot } from './admin';
import { sessionMentorOwner } from './mentor';
export function adminView(snapshot: AdminSnapshot) {
  const { account, ledger, users } = snapshot;
  const name = (id: string) => users.find(user => user.id === id)?.name ?? id;
  return {
    profile: { id: adminIdentity.id, name: adminIdentity.name, email: adminIdentity.email },
    skillRequests: account.requests,
    sessions: ledger.sessions,
    suspendedUserIds: ledger.suspendedUserIds ?? [],
    incidents: ledger.incidents.map(item => { const session = ledger.sessions.find(session => session.id === item.sessionId); return { ...item, reporterName: name(item.reporterId), reporterRole: session && sessionMentorOwner(session) === item.reporterId ? 'mentor' : 'student' }; }),
    movements: ledger.movements.map(item => ({ ...item, date: new Date(item.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima' }), userName: name(item.userId ?? ledger.studentId), concept: ledger.sessions.find(session => session.id === item.sessionId)?.skill ?? item.sessionId })),
    wallets: { [ledger.studentId]: ledger.wallet, ...ledger.wallets },
    adminAuditLog: snapshot.audit,
    openIncidents: ledger.incidents.filter(isOpenIncident),
  };
}
export type AdminViewState = ReturnType<typeof adminView>;
