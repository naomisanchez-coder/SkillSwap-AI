import { PublicError } from '../../errors/PublicError.js';
import { otpDigits } from './email.policy.js';

export function validateVerificationRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).sort().join(',') !== 'code,email,verificationId') {
    throw new PublicError('VALIDATION_ERROR', { general: 'Envía únicamente correo, identificador y código.' });
  }
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const verificationId = typeof input.verificationId === 'string' ? input.verificationId.trim().toLowerCase() : '';
  const code = typeof input.code === 'string' ? input.code : '';
  const fields = {};
  if (email.length > 254 || !/^[a-z]+\.[a-z]+@tecsup\.edu\.pe$/.test(email)) fields.email = 'Usa el correo institucional registrado.';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(verificationId)) fields.verificationId = 'Usa un identificador de verificación válido.';
  if (!new RegExp(`^\\d{${otpDigits}}$`).test(code)) fields.code = `Ingresa el código de ${otpDigits} dígitos.`;
  if (Object.keys(fields).length) throw new PublicError('VALIDATION_ERROR', fields);
  return { email, verificationId, code };
}

export function createEmailVerificationService(repository, protection) {
  if (typeof repository?.verify !== 'function' || typeof protection?.digest !== 'function' ||
      !/^[A-Za-z0-9._-]{1,50}$/.test(protection?.keyVersion ?? '')) throw new Error('Verification dependencies required');
  return Object.freeze({
    async verify(body) {
      const input = validateVerificationRequest(body);
      try {
        const result = await repository.verify({ id: input.verificationId, email: input.email,
          digest: protection.digest({ id: input.verificationId, email: input.email, code: input.code }),
          keyVersion: protection.keyVersion });
        if (result?.outcome !== 'VERIFIED') throw new PublicError('VERIFICATION_INVALID');
        if (result.creditsGranted !== 20) throw new Error('Invalid initial credit grant');
        return { status: 'verified', initialCreditsGranted: true,
          creditsGranted: result.creditsGranted, nextAction: 'login' };
      } catch (error) {
        if (error instanceof PublicError) throw error;
        throw new PublicError('SERVICE_UNAVAILABLE');
      }
    },
  });
}
