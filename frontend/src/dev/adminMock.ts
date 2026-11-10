import type { AdminService } from '../services/admin';
import { adminIdentity, type AdminUser } from '../data/admin';
import { mockAccountService, decideApplication } from './accountMock';
import { localActivity, localIdentity, learnerFixtures } from './localActivity';
import { studentFixture } from './studentMock';
import { mentors } from './mentorFixtures';

// Acceso de desarrollo separado del login real; no es un mecanismo de autorización.
let administrator = false;
const accessKey = 'skillswap:frontend:admin-access';
function assertDevelopment() { if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_FRONTEND_PREVIEW !== 'true') throw new Error('Acceso disponible solo en desarrollo con configuración explícita.'); }
function assertAdmin() { assertDevelopment(); if (!administrator) administrator = sessionStorage.getItem(accessKey) === adminIdentity.id; if (!administrator) throw new Error('Accede con la cuenta administradora para continuar.'); }
export function enterAdminPreview() { assertDevelopment(); sessionStorage.setItem(accessKey, adminIdentity.id); administrator = true; }
export function restoreAdminPreview() { assertDevelopment(); administrator = sessionStorage.getItem(accessKey) === adminIdentity.id; return administrator; }
export function leaveAdminPreview() { administrator = false; sessionStorage.removeItem(accessKey); }
async function users(): Promise<AdminUser[]> {
  const account = await mockAccountService.getAccount(); const profile = studentFixture.profile;
  return [{ id: localIdentity.id, name: account.profile.name ?? localIdentity.name, email: profile.email, career: profile.career, cycle: profile.cycle, verified: true },
    ...Object.entries(learnerFixtures).map(([id, item]) => ({ id, name: item.name, email: `${id}@example.test`, career: profile.career, cycle: 3, verified: true })),
    ...mentors.map(item => ({ id: `mentor-${item.id}`, name: item.name, email: `${item.id}@example.test`, career: profile.career, cycle: 5, verified: true, approvedSkills: item.skillValidated ? [item.skill] : [] }))];
}
export const mockAdminService: AdminService = {
  async getSnapshot() { assertAdmin(); const account = await mockAccountService.getAccount(); const ledger = await localActivity.getLedger(); return { account, ledger, users: await users(), audit: [...(account.adminAuditLog ?? []), ...(ledger.adminAuditLog ?? [])].sort((a,b) => b.createdAt.localeCompare(a.createdAt)) }; },
  async decideSkill(command) { assertAdmin(); await decideApplication(command); },
  async updateActivity(command) { assertAdmin(); await localActivity.updateAdmin(command, (await users()).map(item => item.id)); },
  async getEvidence(id) { assertAdmin(); return mockAccountService.getEvidence(id); },
};
