import { createLocalAccountStore } from './accountStore';
import { getEvidencePdf, saveEvidencePdf, removeEvidencePdf, validateEvidencePdf } from '../data/evidenceStorage';
import { getProfilePhoto, saveProfilePhoto, removeProfilePhoto } from '../data/profilePhotoStorage';
import type { AccountService } from '../services/account';

const account = createLocalAccountStore({ storage: () => localStorage, identity: { id: 'frontend-demo-student', name: 'Alex' }, files: {
  savePhoto: saveProfilePhoto, getPhoto: getProfilePhoto, removePhoto: removeProfilePhoto,
  saveEvidence: saveEvidencePdf, getEvidence: getEvidencePdf, removeEvidence: removeEvidencePdf, validateEvidence: validateEvidencePdf,
} });
function assertDevelopment() {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_FRONTEND_PREVIEW !== 'true') throw new Error('Este servicio de prueba solo está habilitado en desarrollo.');
}
export const mockAccountService: AccountService = {
  async getAccount() { assertDevelopment(); return account.getAccount(); },
  async saveProfile(profile) { assertDevelopment(); return account.saveProfile(profile); },
  async savePhoto(file) { assertDevelopment(); return account.savePhoto(file); },
  async getPhoto(id) { assertDevelopment(); return account.getPhoto(id); },
  async submitApplication(command) { assertDevelopment(); return account.submitApplication(command); },
  async getEvidence(id) { assertDevelopment(); return account.getEvidence(id); },
};
export async function reviewApplicationFixture(id: string, status: 'observation' | 'rejected' | 'approved', comment: string) {
  assertDevelopment(); return account.reviewFixture(id, status, comment);
}
