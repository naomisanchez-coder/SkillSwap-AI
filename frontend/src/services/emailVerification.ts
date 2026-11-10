export type VerificationStatus = 'pending' | 'code_sent' | 'incorrect' | 'expired' | 'verified' | 'service_error' | 'integration_pending';
export type VerificationResult = { status: VerificationStatus; code?: string; expiresAt?: number };
export interface EmailVerificationService {
  mode: 'local' | 'api';
  issue(email: string, signal: AbortSignal): Promise<VerificationResult>;
  verify(email: string, code: string, signal: AbortSignal): Promise<VerificationResult>;
}
/** Sin contrato de Naomi: no se inventa endpoint ni se declara envío/verificación. */
export const pendingEmailVerification: EmailVerificationService = {
  mode: 'api',
  async issue() { return { status: 'integration_pending' }; },
  async verify() { return { status: 'integration_pending' }; },
};
