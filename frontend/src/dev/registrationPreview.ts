import type { RegistrationService } from '../services/registration';
import { getTecsupEmailValidationError, normalizeTecsupEmail } from '../data/academicCatalog';
import { RegistrationError } from '../services/registration';
import type { EmailVerificationService } from '../services/emailVerification';

function assertLocal() { if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_FRONTEND_PREVIEW !== 'true') throw new Error('Acceso local no habilitado.'); }
/** No crea cuentas, no guarda contraseñas, no modifica perfiles ni sesiones existentes. */
export const previewRegistration: RegistrationService = async (input, signal) => {
  assertLocal(); signal.throwIfAborted();
  const email = normalizeTecsupEmail(input.email);
  const error = getTecsupEmailValidationError(email);
  if (error) throw new RegistrationError({ email: error });
  return { email };
};

/** Estado exclusivo de esta revisión de interfaz; nunca concede acceso API. */
export function createVerificationFixture({ now = () => Date.now(), scenario = 'normal' }: { now?: () => number; scenario?: 'normal' | 'expired' | 'service-error' } = {}): EmailVerificationService {
  let expiresAt = 0; let recipient = ''; let failure = scenario === 'service-error'; let expireOnce = scenario === 'expired';
  return {
    mode: 'local',
    async issue(email, signal) {
      signal.throwIfAborted();
      if (failure) { failure = false; return { status: 'service_error' }; }
      recipient = email; expiresAt = now() + (expireOnce ? -1 : 5 * 60_000); expireOnce = false;
      return { status: 'code_sent', code: '246810', expiresAt };
    },
    async verify(email, code, signal) {
      signal.throwIfAborted();
      if (!expiresAt || email !== recipient) return { status: 'service_error' };
      if (now() >= expiresAt) return { status: 'expired' };
      return { status: code === '246810' ? 'verified' : 'incorrect' };
    },
  };
}
export function localVerificationService() {
  assertLocal();
  const value = new URLSearchParams(location.search).get('verification');
  return createVerificationFixture({ scenario: value === 'expired' || value === 'service-error' ? value : 'normal' });
}
