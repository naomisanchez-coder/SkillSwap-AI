import { PublicError } from '../../errors/PublicError.js';
import { registrationPolicy } from './registration.policy.js';

const fields = new Set(['firstName', 'lastName', 'email', 'career', 'cycle', 'password',
  'termsAccepted', 'termsVersion', 'privacyVersion']);
const length = (text) => [...text].length;
const controls = /[\u0000-\u001f\u007f]/;

export function validateRegistration(input, passwordPolicy = registrationPolicy) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
    Object.keys(input).some((key) => !fields.has(key))) {
    throw new PublicError('VALIDATION_ERROR', { general: 'Envía únicamente los campos permitidos del registro.' });
  }
  const errors = {};
  const result = {};
  for (const field of ['firstName', 'lastName']) {
    const value = typeof input[field] === 'string' ? input[field].trim() : '';
    if (length(value) < 2 || length(value) > 100 || !value.isWellFormed() || controls.test(value)) {
      errors[field] = 'Ingresa entre 2 y 100 caracteres válidos.';
    }
    result[field] = value;
  }
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  // Conservative literal interpretation of nombre.apellido; no aliases or extra segments.
  if (email.length > 254 || !/^[a-z]+\.[a-z]+@tecsup\.edu\.pe$/.test(email)) {
    errors.email = 'Usa el formato nombre.apellido@tecsup.edu.pe, sin alias ni espacios interiores.';
  }
  result.email = email;
  const career = typeof input.career === 'string' ? input.career.trim() : '';
  if (!career || length(career) > 150 || !career.isWellFormed() || controls.test(career)) errors.career = 'Selecciona una carrera válida.';
  result.career = career;
  if (!Number.isInteger(input.cycle) || input.cycle < 1 || input.cycle > 65535) {
    errors.cycle = 'Selecciona un ciclo válido.';
  }
  result.cycle = input.cycle;
  // Invalid server configuration fails closed; clients cannot select policy.
  if (!passwordPolicy || !Number.isInteger(passwordPolicy.minLength) ||
    !Number.isInteger(passwordPolicy.maxLength) || passwordPolicy.minLength < 1 ||
    passwordPolicy.maxLength > 128 || passwordPolicy.maxLength < passwordPolicy.minLength ||
    !passwordPolicy.termsVersion || !passwordPolicy.privacyVersion) {
    if (Object.keys(errors).length) throw new PublicError('VALIDATION_ERROR', errors);
    throw new PublicError('SERVICE_UNAVAILABLE');
  }
  if (typeof input.password !== 'string' || !input.password.isWellFormed() || length(input.password) < passwordPolicy.minLength ||
    length(input.password) > passwordPolicy.maxLength || Buffer.byteLength(input.password, 'utf8') > 512) {
    errors.password = 'La contraseña no cumple la longitud permitida.';
  }
  if (input.termsAccepted !== true) errors.termsAccepted = 'Acepta expresamente los términos y la política de privacidad.';
  if (input.termsVersion !== passwordPolicy.termsVersion) errors.termsVersion = 'Revisa y acepta la versión vigente de los términos.';
  if (input.privacyVersion !== passwordPolicy.privacyVersion) errors.privacyVersion = 'Revisa y acepta la versión vigente de privacidad.';
  if (Object.keys(errors).length) throw new PublicError('VALIDATION_ERROR', errors);
  return { ...result, password: input.password, termsVersion: passwordPolicy.termsVersion,
    privacyVersion: passwordPolicy.privacyVersion }; // Never trim or normalize a password.
}
