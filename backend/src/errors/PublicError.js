// Only curated messages may cross the HTTP boundary. Never use driver messages or input values.
const definitions = Object.freeze({
  VALIDATION_ERROR: [422, 'Revisa los datos enviados.'],
  CONFLICT: [409, 'La operación entra en conflicto con el estado actual.'],
  EMAIL_ALREADY_REGISTERED: [409, 'El correo ya está registrado.'],
  VERIFICATION_INVALID: [422, 'El código de verificación no es válido o ya no está disponible.'],
  RECOVERY_INVALID: [422, 'El código de recuperación no es válido o ya no está disponible.'],
  INVALID_CREDENTIALS: [401, 'El correo o la contraseña no son válidos.'],
  SESSION_REQUIRED: [401, 'Inicia sesión para continuar.'],
  EMAIL_NOT_VERIFIED: [403, 'Verifica tu correo antes de iniciar sesión.'],
  ACCOUNT_SUSPENDED: [403, 'La cuenta no está habilitada.'],
  CSRF_INVALID: [403, 'La protección de la solicitud no es válida.'],
  UNAUTHORIZED: [401, 'Inicia sesión para continuar.'],
  UNSUPPORTED_MEDIA_TYPE: [415, 'Envía el cuerpo como application/json.'],
  FORBIDDEN: [403, 'No tienes autorización para esta operación.'],
  RATE_LIMITED: [429, 'Demasiadas solicitudes. Inténtalo más tarde.'],
  AI_PROVIDER_LIMITED: [503, 'El servicio de IA alcanzó temporalmente su límite.'],
  AI_UNAVAILABLE: [503, 'El asistente de IA no está disponible temporalmente.'],
  SERVICE_UNAVAILABLE: [503, 'El servicio no está disponible temporalmente.'],
});

export class PublicError extends Error {
  constructor(code, fields) {
    if (!Object.hasOwn(definitions, code)) throw new TypeError('Unknown public error code');
    const [status, message] = definitions[code];
    super(message);
    this.name = 'PublicError';
    let safeFields;
    if (fields !== undefined) {
      if (code !== 'VALIDATION_ERROR' || fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
        throw new TypeError('Fields are only supported for validation errors');
      }
      const entries = Object.entries(fields);
      if (entries.length > 20 || entries.some(([key, value]) =>
        !/^[a-zA-Z][a-zA-Z0-9]{0,49}$/.test(key) || ['constructor', 'prototype'].includes(key) ||
        typeof value !== 'string' || !value.trim() || value.length > 200)) {
        throw new TypeError('Invalid public validation fields');
      }
      safeFields = Object.freeze(Object.fromEntries(entries));
    }
    Object.defineProperties(this, {
      status: { value: status, enumerable: true },
      code: { value: code, enumerable: true },
      publicMessage: { value: message },
      fields: { value: safeFields, enumerable: true },
    });
  }
}
