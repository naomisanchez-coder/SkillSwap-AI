import { getTecsupEmailValidationError, normalizeTecsupEmail } from '../data/academicCatalog';

export type PasswordRecoveryResult =
  | { status: 'invalid'; message: string }
  | { status: 'integration_pending'; email: string };

/** Sustituir este adaptador al confirmar el contrato de recuperación con la API.
 * No consulta cuentas, envía correo ni guarda direcciones en el navegador.
 */
export interface PasswordRecoveryService {
  submit(email: string, signal: AbortSignal): Promise<PasswordRecoveryResult>;
}

export const passwordRecoveryService: PasswordRecoveryService = {
  async submit(value, signal) {
    signal.throwIfAborted();
    const email = normalizeTecsupEmail(value);
    const error = email.length > 254
      ? 'El correo institucional debe tener como máximo 254 caracteres.'
      : getTecsupEmailValidationError(email);
    return error ? { status: 'invalid', message: error } : { status: 'integration_pending', email };
  },
};
