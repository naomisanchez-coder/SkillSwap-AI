export type AuthenticatedUser = {
  id: string; firstName: string; lastName: string; name: string; email: string;
  institution: string; career: string; cycle: number; role: 'student' | 'admin';
  emailVerified: true; onboardingComplete: boolean;
};
export type AuthSession = { user: AuthenticatedUser; csrfToken: string };

export class AuthError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function apiBase(value: string | undefined) {
  const base = value?.trim().replace(/\/+$/, '');
  try {
    const url = new URL(base ?? '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
  } catch { throw new AuthError(0, 'API_CONFIG_INVALID', 'No se puede conectar con el servicio. Contacta al equipo del proyecto.'); }
  return base!;
}
async function requestSession(path: 'login' | 'me', signal: AbortSignal, input?: { email: string; password: string; remember: boolean }): Promise<AuthSession> {
  const base = apiBase(import.meta.env.VITE_API_URL || 'http://localhost:4000/api');
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(`${base}/auth/${path}`, { method: input ? 'POST' : 'GET', credentials: 'include',
      cache: 'no-store', headers: input ? { 'Content-Type': 'application/json', 'X-CSRF-Protection': '1' } : undefined,
      body: input ? JSON.stringify(input) : undefined,
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    });
    body = await response.json().catch(() => null);
  } catch { throw new AuthError(0, 'NETWORK_ERROR', 'No fue posible conectar con el servicio. Comprueba tu conexión e inténtalo de nuevo.'); }
  const data = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const error = data.error && typeof data.error === 'object' ? data.error as Record<string, unknown> : {};
  const code = typeof error.code === 'string' ? error.code : 'AUTH_ERROR';
  if (!response.ok) {
    let message = 'No fue posible completar la operación de acceso. Inténtalo más tarde.';
    if (response.status === 401) message = path === 'login' ? 'Correo o contraseña incorrectos.' : 'La sesión ya no está disponible. Inicia sesión nuevamente.';
    if (response.status === 403 && code === 'EMAIL_NOT_VERIFIED') message = 'Tu correo sigue sin verificar. Completa la verificación antes de acceder.';
    if (response.status === 403 && code === 'ACCOUNT_SUSPENDED') message = 'Tu cuenta está suspendida. Contacta al equipo del proyecto.';
    if (response.status === 403 && ['CSRF_INVALID', 'ORIGIN_NOT_ALLOWED'].includes(code)) message = 'No se pudo autorizar la solicitud de acceso. Revisa la dirección de la aplicación con el equipo del proyecto.';
    if (response.status === 429) {
      const retry = Number(response.headers.get('Retry-After'));
      message = `Demasiados intentos. ${Number.isInteger(retry) && retry > 0 && retry <= 3600 ? `Espera ${retry} segundos antes de volver a intentar.` : 'Espera unos minutos antes de volver a intentar.'}`;
    }
    if (response.status >= 500) message = 'El servicio de acceso no está disponible. Inténtalo más tarde.';
    throw new AuthError(response.status, code, message);
  }
  const user = data.user && typeof data.user === 'object' ? data.user as Record<string, unknown> : {};
  const textFields = ['id', 'firstName', 'lastName', 'name', 'email', 'institution', 'career'];
  if (response.status !== 200 || textFields.some(field => typeof user[field] !== 'string')
    || !['student', 'admin'].includes(String(user.role)) || user.emailVerified !== true
    || typeof user.onboardingComplete !== 'boolean' || !Number.isInteger(user.cycle)
    || typeof data.csrfToken !== 'string' || !/^[a-f0-9]{64}$/.test(data.csrfToken)) {
    throw new AuthError(0, 'INVALID_RESPONSE', 'No pudimos confirmar el acceso. Inténtalo de nuevo.');
  }
  // Lista pública explícita: no conservar campos adicionales de la respuesta.
  return { user: { id: user.id as string, firstName: user.firstName as string, lastName: user.lastName as string,
    name: user.name as string, email: user.email as string, institution: user.institution as string,
    career: user.career as string, cycle: user.cycle as number, role: user.role as 'student' | 'admin',
    emailVerified: true, onboardingComplete: user.onboardingComplete }, csrfToken: data.csrfToken };
}

export const login = (input: { email: string; password: string; remember: boolean }, signal: AbortSignal) => requestSession('login', signal, input);
export const getSession = (signal: AbortSignal) => requestSession('me', signal);

/** Contrato documentado: cookie, CSRF de sesión en memoria, sin campos de negocio. */
export async function logoutSession(csrfToken: string, signal: AbortSignal, baseUrl = import.meta.env.VITE_API_URL): Promise<void> {
  const base = apiBase(baseUrl);
  if (!/^[a-f0-9]{64}$/.test(csrfToken)) throw new AuthError(0, 'CSRF_MISSING', 'No pudimos autorizar el cierre. Vuelve a comprobar la sesión.');
  let response: Response;
  try {
    response = await fetch(`${base}/auth/logout`, { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: '{}', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
  } catch { throw new AuthError(0, 'NETWORK_ERROR', 'No pudimos cerrar tu sesión porque no se pudo conectar con el servicio. Vuelve a intentarlo.'); }
  const data: unknown = await response.json().catch(() => null);
  if (response.status !== 200 || !data || typeof data !== 'object' || (data as { status?: unknown }).status !== 'ok') throw new AuthError(response.status, 'LOGOUT_FAILED', 'No pudimos confirmar el cierre de tu sesión. Vuelve a intentarlo o comprueba la sesión.');
}
