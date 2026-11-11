import type { AccountData, ApplicationCommand, PersonalProfile } from '../data/account';

/** Contrato sustituible por la API; los componentes no acceden a IndexedDB ni localStorage. */
export interface AccountService {
  getSkillOptions?(): Promise<string[]>;
  getAccount(): Promise<AccountData>;
  saveProfile(profile: Pick<PersonalProfile, 'name' | 'bio'> & { career?: string; cycle?: number }): Promise<AccountData>;
  savePhoto(file: File): Promise<AccountData>;
  getPhoto(id: string): Promise<Blob | null>;
  submitApplication(command: ApplicationCommand): Promise<AccountData>;
  getEvidence(id: string): Promise<Blob | null>;
}
