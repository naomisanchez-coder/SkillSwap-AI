export const LEGAL_VERSIONS = { terms: 'v1', privacy: 'v1' } as const;

export type RegistrationRequest = {
  firstName: string; lastName: string; email: string; career: string; cycle: number; password: string;
  termsAccepted: true; termsVersion: string; privacyVersion: string;
};
export type RegistrationService = (input: RegistrationRequest, signal: AbortSignal) => Promise<{ email: string }>;

export class RegistrationError extends Error {
  readonly fields: Record<string, string>;
  constructor(fields: Record<string, string>) {
    super('No fue posible confirmar el registro.');
    this.fields = fields;
  }
}

/** Solo registro público: no crea ni guarda una sesión y no reintenta solicitudes. */
export async function registerStudent(input: RegistrationRequest, signal: AbortSignal): Promise<{ email: string }> {
  const base = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new RegistrationError({ general: 'La dirección de la API no está configurada. Contacta al equipo del proyecto.' });
  try {
    const url = new URL(base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
  } catch { throw new RegistrationError({ general: 'La dirección de la API no es válida. Contacta al equipo del proyecto.' }); }

  let response: Response;
  try {
    response = await fetch(`${base}/auth/register`, { method: 'POST', credentials: 'omit',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    });
  } catch {
    throw new RegistrationError({ general: 'No pudimos confirmar el registro. Revisa tu conexión y la disponibilidad del servicio. La solicitud no se reenvió automáticamente.' });
  }

  const body = await response.json().catch(() => null);
  if (response.status === 409 && body?.error?.code === 'EMAIL_ALREADY_REGISTERED') {
    throw new RegistrationError({ email: 'Este correo ya está registrado.' });
  }
  if (response.status === 422 && body?.error?.code === 'VALIDATION_ERROR') {
    const fields: Record<string, string> = {};
    const mapping: Record<string, string> = { firstName: 'firstName', lastName: 'lastName', email: 'email',
      career: 'career', cycle: 'cycle', password: 'password', termsAccepted: 'terms',
      termsVersion: 'terms', privacyVersion: 'terms', general: 'general' };
    if (body.error.fields && typeof body.error.fields === 'object') {
      for (const [name, message] of Object.entries(body.error.fields)) {
        const target = Object.hasOwn(mapping, name) ? mapping[name] : undefined;
        if (target && typeof message === 'string') fields[target] = message;
      }
    }
    throw new RegistrationError(Object.keys(fields).length ? fields : { general: 'El servidor no aceptó los datos. Revisa el formulario.' });
  }
  if (!response.ok) {
    throw new RegistrationError({ general: response.status >= 500
      ? 'El servicio no está disponible. No pudimos confirmar el registro. Inténtalo más tarde.'
      : 'No fue posible completar el registro. Revisa los datos o contacta al equipo.' });
  }
  if (response.status !== 201 || body?.user?.email !== input.email || body.user.role !== 'student'
    || body.user.emailVerified !== false || body.user.onboardingComplete !== false) {
    throw new RegistrationError({ general: 'No pudimos confirmar la respuesta del servicio. No se inició sesión ni se reenvió la solicitud.' });
  }
  return { email: body.user.email };
}
