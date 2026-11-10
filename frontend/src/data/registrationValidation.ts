import { ACADEMIC_CYCLES, getTecsupEmailValidationError, normalizeTecsupEmail, TECSUP_CAREERS } from './academicCatalog';

export type RegistrationFormValues = { firstName: string; lastName: string; email: string; career: string; cycle: string; password: string; confirmPassword: string; accepted: boolean };
// Con /u, los pares válidos se interpretan como un único punto de código.
const wellFormed = (value: string) => !/[\uD800-\uDFFF]/u.test(value);
export function validateRegistrationForm(value: RegistrationFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of ['firstName', 'lastName'] as const) {
    const name = value[field].trim();
    if ([...name].length < 2 || [...name].length > 100 || !wellFormed(name) || [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) errors[field] = 'Ingresa entre 2 y 100 caracteres válidos, sin caracteres de control.';
  }
  if (!TECSUP_CAREERS.includes(value.career)) errors.career = 'Selecciona una carrera del catálogo vigente.';
  if (!ACADEMIC_CYCLES.includes(Number(value.cycle))) errors.cycle = 'Selecciona un ciclo autorizado.';
  const emailError = getTecsupEmailValidationError(value.email);
  if (emailError || normalizeTecsupEmail(value.email).length > 254) errors.email = emailError ?? 'El correo no puede superar 254 caracteres.';
  if (!wellFormed(value.password) || [...value.password].length < 8 || [...value.password].length > 128 || new TextEncoder().encode(value.password).length > 512) errors.password = 'La contraseña debe tener entre 8 y 128 caracteres Unicode válidos, hasta 512 bytes.';
  if (!value.confirmPassword) errors.confirm = 'Confirma tu contraseña.';
  else if (value.password !== value.confirmPassword) errors.confirm = 'Las contraseñas son diferentes.';
  if (!value.accepted) errors.terms = 'Debes aceptar los términos y la política de privacidad.';
  return errors;
}
