import { PublicError } from '../../errors/PublicError.js';
export function validateMentorDetails(body) {
  const fields = {};
  if (!['Intermedio', 'Avanzado'].includes(body.declaredLevel)) fields.declaredLevel = 'Selecciona el nivel que declaras para enseñar.';
  for (const key of ['experience', 'topics']) {
    const value = body[key];
    if (typeof value !== 'string' || !value.isWellFormed() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || [...value.trim()].length < 1 || [...value.trim()].length > 2000) fields[key] = 'Escribe entre 1 y 2000 caracteres válidos.';
  }
  if (Object.keys(fields).length) throw new PublicError('VALIDATION_ERROR', fields);
  return { declaredLevel: body.declaredLevel, experience: body.experience.trim(), topics: body.topics.trim() };
}
