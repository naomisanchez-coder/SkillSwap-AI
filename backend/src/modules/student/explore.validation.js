import { PublicError } from '../../errors/PublicError.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const controls = /[\u0000-\u001f\u007f]/;

function source(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function one(value, field, maximum) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || Array.isArray(value) || !value.isWellFormed() || controls.test(value)) {
    throw new PublicError('VALIDATION_ERROR', { [field]: 'Usa un texto válido.' });
  }
  const normalized = value.trim();
  if (!normalized || [...normalized].length > maximum) {
    throw new PublicError('VALIDATION_ERROR', { [field]: `Usa entre 1 y ${maximum} caracteres.` });
  }
  return normalized;
}

function limit(value, maximum = 50) {
  const result = value === undefined ? 20 : Number(value);
  if (!Number.isInteger(result) || result < 1 || result > maximum || String(result) !== String(value ?? result)) {
    throw new PublicError('VALIDATION_ERROR', { limit: `Selecciona entre 1 y ${maximum} resultados.` });
  }
  return result;
}

function cursor(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,1024}$/.test(value)) {
    throw new PublicError('VALIDATION_ERROR', { cursor: 'El cursor no es válido.' });
  }
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    if (Buffer.from(decoded).toString('base64url') !== value) throw new Error();
    const parsed = JSON.parse(decoded);
    if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== 'string' ||
        !parsed[0] || parsed[0].length > 250 || !uuid.test(parsed[1])) throw new Error();
    return { label: parsed[0], id: parsed[1].toLowerCase() };
  } catch { throw new PublicError('VALIDATION_ERROR', { cursor: 'El cursor no es válido.' }); }
}

export function validateExploreQuery(query) {
  const input = source(query);
  if (Object.keys(input).some(key => !['q', 'category', 'skillId', 'limit', 'cursor'].includes(key)) ||
      Object.values(input).some(Array.isArray)) {
    throw new PublicError('VALIDATION_ERROR', { query: 'Usa únicamente los filtros permitidos.' });
  }
  const skillId = input.skillId === undefined ? null : one(input.skillId, 'skillId', 36);
  if (skillId && !uuid.test(skillId)) throw new PublicError('VALIDATION_ERROR', { skillId: 'Selecciona una habilidad válida.' });
  return { q: one(input.q, 'q', 120), category: one(input.category, 'category', 100),
    skillId: skillId?.toLowerCase() ?? null, limit: limit(input.limit), cursor: cursor(input.cursor) };
}

export function validateRecommendationsQuery(query) {
  const input = source(query);
  if (Object.keys(input).some(key => key !== 'limit') || Array.isArray(input.limit)) {
    throw new PublicError('VALIDATION_ERROR', { query: 'Usa únicamente limit.' });
  }
  return { limit: limit(input.limit, 20) };
}

export function validateMentorId(value) {
  if (typeof value !== 'string' || !uuid.test(value)) {
    throw new PublicError('VALIDATION_ERROR', { mentorId: 'Selecciona un mentor válido.' });
  }
  return value.toLowerCase();
}
