import { api } from './http';
import { getTecsupEmailValidationError, normalizeTecsupEmail } from '../data/academicCatalog';
export type PasswordRecoveryResult = { status: 'invalid'; message: string } | { status: 'accepted'; email: string; recoveryId: string };
export interface PasswordRecoveryService { submit(email: string, signal: AbortSignal): Promise<PasswordRecoveryResult> }
export const passwordRecoveryService: PasswordRecoveryService = {
  async submit(value, signal) {
    const email = normalizeTecsupEmail(value);
    const error = getTecsupEmailValidationError(email);
    if (error) return { status: 'invalid', message: error };
    const result = await api<{ recoveryId: string }>('/auth/password-recovery/request', { method: 'POST', body: { email }, signal });
    return { status: 'accepted', email, recoveryId: result.recoveryId };
  },
};
export const resetPassword = (email: string, recoveryId: string, code: string, newPassword: string, signal: AbortSignal) =>
  api('/auth/password-recovery/reset', { method: 'POST', body: { email, recoveryId, code, newPassword }, signal });
