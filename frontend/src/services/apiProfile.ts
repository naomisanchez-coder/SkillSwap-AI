import { api, ApiError } from './http';
import type { AuthSession } from './auth';
import type { AccountService } from './account';
import type { ProfileService } from './profile';
import type { AccountData, MentorSkillRequest } from '../data/account';
import type { UserProfile } from '../data/student';
import type { OnboardingPreferences } from '../data/profileOptions';

export type ApiProfile = { id: string; firstName: string; lastName: string; email: string; institution: string; career: string; cycle: number; bio: string | null; interests: string[]; level: string | null; goals: string | null; schedule: string | null; onboardingComplete: boolean };
export type ApiSkill = { id: string; name: string; learning?: boolean; teaching?: boolean };
type Application = { id: string; skill: string; status: string; portfolioUrl: string | null; submittedAt: string; decisionNotes: string | null; certificateAttached: boolean };
export function profileView(p: ApiProfile): UserProfile {
  return { id: p.id, name: `${p.firstName} ${p.lastName}`, email: p.email, institution: p.institution, career: p.career, cycle: p.cycle,
    bio: p.bio ?? '', interests: p.interests, level: p.level ?? '', availability: p.schedule ?? '', goals: p.goals ?? '', modality: 'Virtual', photoStorageId: p.id };
}
export function createProfileServices(session: AuthSession) {
  const request = <T>(path: string, method?: string, body?: unknown) => api<T>(`/student${path}`, { method, body, csrf: session.csrfToken });
  const readProfile = async () => (await request<{ profile: ApiProfile }>('/profile')).profile;
  const account: AccountService = {
    async getAccount(): Promise<AccountData> {
      const [profile, result] = await Promise.all([readProfile(), request<{ applications: Application[] }>('/mentor-applications')]);
      return { version: 1, userId: profile.id, profile: { name: `${profile.firstName} ${profile.lastName}`, bio: profile.bio ?? '', photoStorageId: profile.id }, notifications: [],
        requests: result.applications.map((a): MentorSkillRequest => ({ id: a.id, ownerUserId: profile.id, userName: `${profile.firstName} ${profile.lastName}`, skill: a.skill,
          status: ({ PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', OBSERVED: 'observation' } as const)[a.status as 'PENDING'] ?? 'pending',
          level: '', experience: '', topics: '', portfolio: a.portfolioUrl ?? '', evidenceName: a.certificateAttached ? 'Certificado adjunto' : '', evidenceStorageId: a.certificateAttached ? a.id : undefined,
          requestedAt: a.submittedAt, adminComment: a.decisionNotes ?? undefined, history: [], submissionId: a.id, submissionSignature: '' })) };
    },
    async saveProfile(value) {
      const current = await readProfile();
      // La pantalla edita el nombre completo; conservar apellidos cuando no cambian.
      const name = (value.name ?? '').trim();
      const unchanged = name === `${current.firstName} ${current.lastName}`;
      const parts = name.split(/\s+/);
      const lastName = unchanged ? current.lastName : parts.slice(1).join(' ');
      await request('/profile', 'PATCH', { firstName: unchanged ? current.firstName : parts[0], lastName, bio: value.bio ?? '' });
      return account.getAccount();
    },
    async savePhoto(file) { const data = new FormData(); data.set('photo', file); await request('/profile/photo', 'PUT', data); return account.getAccount(); },
    async getPhoto() { try { return await api<Blob>('/student/profile/photo', { binary: true }); } catch (error) { if (error instanceof ApiError && ['FILE_NOT_FOUND', 'NOT_FOUND'].includes(error.code)) return null; throw error; } },
    async getEvidence(id) { return api<Blob>(`/student/mentor-applications/${encodeURIComponent(id)}/documents/certificate`, { binary: true }); },
    async submitApplication(command) {
      const { skills } = await request<{ skills: ApiSkill[] }>('/skills/catalog');
      const skill = skills.find(s => s.name === command.skill);
      if (!skill) throw new Error('La habilidad no está disponible en el catálogo del servidor.');
      const { applications } = await request<{ applications: Application[] }>('/mentor-applications');
      const existing = applications.find(a => a.id === command.id);
      const data = new FormData();
      if (command.evidenceFile) data.set('certificate', command.evidenceFile);
      if (existing) {
        if (command.evidenceFile) await request(`/mentor-applications/${existing.id}/certificate`, 'PUT', data);
        await request(`/mentor-applications/${existing.id}/resubmit`, 'POST', {});
      } else {
        data.set('skillId', skill.id);
        if (command.portfolio) data.set('portfolioUrl', command.portfolio);
        await request('/mentor-applications', 'POST', data);
      }
      return account.getAccount();
    },
  };
  const preferences: ProfileService = {
    async getPreferences() { return profileView(await readProfile()); },
    async savePreferences(value: OnboardingPreferences) {
      const [{ skills }, own] = await Promise.all([request<{ skills: ApiSkill[] }>('/skills/catalog'), request<{ skills: ApiSkill[] }>('/skills')]);
      const selected = new Set(value.interests);
      for (const name of selected) if (!skills.some(s => s.name === name)) throw new Error(`La habilidad ${name} no está disponible en el servidor.`);
      await request('/onboarding', 'PUT', { interests: value.interests, level: value.level, schedule: value.availability });
      await request('/profile', 'PATCH', { goals: value.goals });
      // Mantener intención TEACH y sincronizar LEARN para el ranking real.
      for (const skill of skills) {
        const previous = own.skills.find(s => s.id === skill.id);
        if (Boolean(previous?.learning) !== selected.has(skill.name)) await request(`/skills/${skill.id}`, 'PUT', { learning: selected.has(skill.name), teaching: Boolean(previous?.teaching) });
      }
      return profileView(await readProfile());
    },
    async resetPreferences() { await request('/profile', 'PATCH', { interests: [], level: null, schedule: null, goals: null }); },
  };
  return { account, preferences, readProfile };
}
