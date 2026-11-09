export const TECSUP_INSTITUTION = 'TECSUP';

/**
 * Catálogo referencial para el prototipo.
 * Las denominaciones deben confirmarse antes de una puesta en servicio.
 */
export const TECSUP_CAREERS = [
  'Diseño y Desarrollo de Software',
  'Administración de Redes y Comunicaciones',
  'Mecatrónica Industrial',
  'Electrotecnia Industrial',
  'Gestión y Mantenimiento de Maquinaria Industrial',
] as const;

export const ACADEMIC_CYCLES = [1, 2, 3, 4, 5, 6] as const;

export const AUTHORIZED_TECSUP_EMAIL_DOMAINS: readonly string[] = ['tecsup.edu.pe'];
export const TECSUP_EMAIL_DOMAIN_STATUS = 'configured' as const;

const TECSUP_STUDENT_EMAIL_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@tecsup\.edu\.pe$/;

export function normalizeTecsupEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getEmailDomain(email: string): string {
  return normalizeTecsupEmail(email).split('@')[1] ?? '';
}

export function getTecsupEmailValidationError(email: string): string | null {
  const normalized = normalizeTecsupEmail(email);
  const parts = normalized.split('@');

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return 'Ingresa un correo institucional válido, por ejemplo: sheila@tecsup.edu.pe.';
  }

  if (parts[1] === 'demo.pe') {
    return 'Los correos @demo.pe pertenecen únicamente a las pruebas del prototipo y no pueden registrarse como cuentas de estudiante.';
  }

  if (!AUTHORIZED_TECSUP_EMAIL_DOMAINS.includes(parts[1])) {
    return 'Usa tu correo institucional con el dominio exacto @tecsup.edu.pe. No se aceptan correos personales ni dominios similares.';
  }

  if (!TECSUP_STUDENT_EMAIL_PATTERN.test(normalized)) {
    return 'Ingresa un nombre de usuario válido antes de @tecsup.edu.pe, sin espacios ni puntos al inicio, al final o consecutivos.';
  }

  return null;
}

export function isAuthorizedTecsupEmail(email: string): boolean {
  return getTecsupEmailValidationError(email) === null;
}
