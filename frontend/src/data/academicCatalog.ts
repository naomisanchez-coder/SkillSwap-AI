import catalog from './academic-1.0.0.json' with { type: 'json' };
export const TECSUP_INSTITUTION = 'TECSUP';

/**
 * Catálogo referencial para el prototipo.
 * Las denominaciones deben confirmarse antes de una puesta en servicio.
 */
export const TECSUP_CAREERS: readonly string[] = catalog.careers.map(career => career.name);

export const ACADEMIC_CYCLES: readonly number[] = catalog.cycles;

export const AUTHORIZED_TECSUP_EMAIL_DOMAINS: readonly string[] = ['tecsup.edu.pe'];
export const TECSUP_EMAIL_DOMAIN_STATUS = 'configured' as const;

// Contrato de registro: dos segmentos de letras ASCII y un único punto.
const TECSUP_STUDENT_EMAIL_PATTERN = /^[a-z]+\.[a-z]+@tecsup\.edu\.pe$/;

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
    return 'Usa el formato nombre.apellido@tecsup.edu.pe, por ejemplo: sheila.diaz@tecsup.edu.pe.';
  }

  if (parts[1] === 'demo.pe') {
    return 'Los correos @demo.pe pertenecen únicamente a las pruebas del prototipo y no pueden registrarse como cuentas de estudiante.';
  }

  if (!AUTHORIZED_TECSUP_EMAIL_DOMAINS.includes(parts[1])) {
    return 'Usa tu correo institucional con el dominio exacto @tecsup.edu.pe. No se aceptan correos personales ni dominios similares.';
  }

  if (!TECSUP_STUDENT_EMAIL_PATTERN.test(normalized)) {
    return 'Usa nombre.apellido@tecsup.edu.pe: dos segmentos de letras de la a a la z separados por un solo punto, sin números, símbolos ni espacios interiores.';
  }

  return null;
}

export function isAuthorizedTecsupEmail(email: string): boolean {
  return getTecsupEmailValidationError(email) === null;
}
