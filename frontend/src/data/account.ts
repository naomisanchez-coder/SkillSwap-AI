import type { NotificationRecord, SkillRequest } from './student';
import { ACTIVE_SKILLS } from './skillCatalog';
import type { AdminAudit } from './admin';

export type PersonalProfile = { name?: string; bio?: string; photoStorageId?: string };
export type ApplicationReview = { id: string; status: SkillRequest['status']; at: string; comment?: string };
export type MentorSkillRequest = SkillRequest & {
  userName: string; skill: string; level: 'Intermedio' | 'Avanzado'; experience: string; topics: string;
  portfolio: string; evidenceName: string; evidenceStorageId?: string; requestedAt: string;
  adminComment?: string; reviewedAt?: string; history: ApplicationReview[];
  submissionId: string; submissionSignature: string;
};
export type ApplicationFields = Pick<MentorSkillRequest, 'skill' | 'level' | 'experience' | 'topics' | 'portfolio'>;
export type ApplicationCommand = ApplicationFields & { id: string; submissionId: string; evidenceFile?: File; evidenceStorageId?: string };
export type AccountData = { version: 1; userId: string; profile: PersonalProfile; requests: MentorSkillRequest[]; notifications: NotificationRecord[]; adminAuditLog?: AdminAudit[] };
export const applicationStatuses = { pending: ['Pendiente', 'warning'], observation: ['En observación', 'warning'], approved: ['Aprobada', 'success'], rejected: ['Rechazada', 'danger'] } as const;
export class AccountError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = 'AccountError'; this.code = code; }
}
export function normalizePersonalProfile(value: Pick<PersonalProfile, 'name' | 'bio'>): Pick<PersonalProfile, 'name' | 'bio'> {
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 120) throw new AccountError('validation', 'Ingresa tu nombre completo, de hasta 120 caracteres.');
  if (typeof value.bio !== 'string' || value.bio.trim().length > 1000) throw new AccountError('validation', 'La biografía admite hasta 1000 caracteres.');
  return { name: value.name.trim(), bio: value.bio.trim() };
}
export function isHttpsPortfolio(value: string): boolean {
  if (!value.trim()) return true;
  try { const url = new URL(value.trim()); return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password && !/\s/.test(value.trim()); } catch { return false; }
}
export function normalizeApplication(value: ApplicationFields): ApplicationFields {
  const skill = typeof value.skill === 'string' ? ACTIVE_SKILLS.find(item => item.name.toLowerCase() === value.skill.trim().toLowerCase())?.name : undefined;
  if (!skill) throw new AccountError('validation', 'Selecciona una habilidad vigente del catálogo.');
  if (!['Intermedio', 'Avanzado'].includes(value.level)) throw new AccountError('validation', 'Selecciona un nivel Intermedio o Avanzado.');
  if (typeof value.experience !== 'string' || !value.experience.trim() || value.experience.trim().length > 2000) throw new AccountError('validation', 'Describe tu experiencia en un máximo de 2000 caracteres.');
  if (typeof value.topics !== 'string' || !value.topics.trim() || value.topics.trim().length > 2000) throw new AccountError('validation', 'Indica los temas que puedes enseñar, hasta 2000 caracteres.');
  if (typeof value.portfolio !== 'string' || value.portfolio.trim().length > 2048 || !isHttpsPortfolio(value.portfolio)) throw new AccountError('validation', 'Ingresa una URL HTTPS válida para tu portafolio.');
  return { skill, level: value.level, experience: value.experience.trim(), topics: value.topics.trim(), portfolio: value.portfolio.trim() };
}
