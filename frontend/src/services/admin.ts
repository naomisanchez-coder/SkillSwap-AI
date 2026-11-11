import type { AdminActivityAction, AdminSnapshot, SkillDecision } from '../data/admin';
export interface AdminService {
  getSnapshot(): Promise<AdminSnapshot>;
  decideSkill(command: SkillDecision): Promise<void>;
  updateActivity(command: AdminActivityAction): Promise<void>;
  getEvidence(id: string): Promise<Blob | null>;
}
