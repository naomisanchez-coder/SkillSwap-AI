import type { AccountData } from './account';
import type { BookingLedger, IncidentRecord } from './booking';

export const adminIdentity = { id: 'admin-frontend', name: 'Administración académica', email: 'admin@example.test', role: 'admin' as const };
export type AdminAudit = { id: string; adminId: string; adminName: string; action: 'skill_approved' | 'skill_rejected' | 'skill_observed' | 'account_suspended' | 'account_reactivated' | 'incident_reviewed' | 'incident_resolved'; entityType: 'request' | 'user' | 'incident'; entityId: string; detail: string; createdAt: string };
export type SkillDecision = { id: string; submissionId: string; decisionId: string; status: 'approved' | 'rejected'; comment: string };
export type IncidentResolution = 'refund' | 'release' | 'no_adjustment';
export type AdminActivityAction = { type: 'suspension'; userId: string; suspended: boolean } | { type: 'review'; id: string } | { type: 'resolve'; id: string; resolution: IncidentResolution; comment: string };
export type AdminUser = { id: string; name: string; email: string; career: string; cycle: number; verified: boolean; approvedSkills?: string[] };
export type AdminSnapshot = { account: AccountData; ledger: BookingLedger; users: AdminUser[]; audit: AdminAudit[] };
export const isOpenIncident = (incident: IncidentRecord) => incident.status === 'open' || incident.status === 'in_review';
export function auditRecord(action: AdminAudit['action'], entityType: AdminAudit['entityType'], entityId: string, detail: string, now: Date, id: string = crypto.randomUUID()): AdminAudit {
  return { id, ...{ adminId: adminIdentity.id, adminName: adminIdentity.name }, action, entityType, entityId, detail, createdAt: now.toISOString() };
}
export function validateAudit(value: AdminAudit[] | undefined) {
  if (value === undefined) return;
  if (!Array.isArray(value) || new Set(value.map(item => item.id)).size !== value.length || value.some(item => !item.id || item.adminId !== adminIdentity.id || !item.detail || !Number.isFinite(Date.parse(item.createdAt)) || !['request', 'user', 'incident'].includes(item.entityType) || !['skill_approved', 'skill_rejected', 'skill_observed', 'account_suspended', 'account_reactivated', 'incident_reviewed', 'incident_resolved'].includes(item.action))) throw new Error('Auditoría no válida.');
}
