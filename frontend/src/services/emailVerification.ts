import { api, ApiError } from './http';
export type VerificationStatus = 'pending' | 'code_sent' | 'incorrect' | 'expired' | 'verified' | 'service_error' | 'integration_pending';
export type VerificationResult = { status: VerificationStatus; code?: string; expiresAt?: number };
export interface EmailVerificationService {
  mode: 'local' | 'api';
  issue(email: string, signal: AbortSignal): Promise<VerificationResult>;
  verify(email: string, code: string, signal: AbortSignal): Promise<VerificationResult>;
}
/** El identificador OTP se conserva solo en memoria y se sustituye al reenviar. */
const verificationIds = new Map<string, string>();
export const pendingEmailVerification: EmailVerificationService = {
  mode: 'api',
  async issue(email, signal) {
    const result = await api<{ verificationId: string; status: string }>('/auth/email/send-code', { method: 'POST', body: { email }, signal });
    verificationIds.set(email, result.verificationId);
    return { status: 'code_sent' };
  },
  async verify(email, code, signal) {
    const verificationId = verificationIds.get(email);
    if (!verificationId) return { status: 'expired' };
    try {
      await api('/auth/email/verify', { method: 'POST', body: { email, code, verificationId }, signal });
      verificationIds.delete(email);
      return { status: 'verified' };
    } catch (error) { if (error instanceof ApiError && error.code === 'VERIFICATION_INVALID') return { status: 'incorrect' }; throw error; }
  },
};
