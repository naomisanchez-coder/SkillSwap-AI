import { PublicError } from '../../errors/PublicError.js';

const profileFields = new Set(['firstName', 'lastName', 'bio', 'career', 'cycle',
  'interests', 'level', 'goals', 'schedule']);
const controls = /[\u0000-\u001f\u007f]/;
const length = value => [...value].length;
const cursorTime = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function text(value, field, { min = 1, max, nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !value.isWellFormed() || controls.test(value)) {
    throw new PublicError('VALIDATION_ERROR', { [field]: 'Usa un texto válido.' });
  }
  const normalized = value.trim();
  if (nullable && normalized === '') return null;
  if (length(normalized) < min || length(normalized) > max) {
    throw new PublicError('VALIDATION_ERROR', { [field]: `Debe contener entre ${min} y ${max} caracteres.` });
  }
  return normalized;
}

export function validateInterests(value, { required = false } = {}) {
  if (!Array.isArray(value) || value.length > 10 || (required && value.length === 0)) {
    throw new PublicError('VALIDATION_ERROR', { interests: required
      ? 'Selecciona entre uno y diez intereses.' : 'Envía como máximo diez intereses.' });
  }
  const interests = value.map(item => text(item, 'interests', { min: 2, max: 100 }));
  const unique = new Set(interests.map(item => item.toLocaleLowerCase('es-PE')));
  if (unique.size !== interests.length) {
    throw new PublicError('VALIDATION_ERROR', { interests: 'No repitas intereses.' });
  }
  return interests;
}

export function validateProfilePatch(body) {
  if (!plainObject(body) || Object.keys(body).length === 0 ||
      Object.keys(body).some(key => !profileFields.has(key))) {
    throw new PublicError('VALIDATION_ERROR', { general: 'Envía únicamente campos editables del perfil.' });
  }
  if (Object.hasOwn(body, 'career') !== Object.hasOwn(body, 'cycle')) {
    throw new PublicError('VALIDATION_ERROR', { career: 'Actualiza carrera y ciclo juntos.',
      cycle: 'Actualiza carrera y ciclo juntos.' });
  }
  const result = {};
  if (Object.hasOwn(body, 'firstName')) result.firstName = text(body.firstName, 'firstName', { min: 2, max: 100 });
  if (Object.hasOwn(body, 'lastName')) result.lastName = text(body.lastName, 'lastName', { min: 2, max: 100 });
  if (Object.hasOwn(body, 'bio')) result.bio = text(body.bio, 'bio', { max: 500, nullable: true });
  if (Object.hasOwn(body, 'goals')) result.goals = text(body.goals, 'goals', { max: 1000, nullable: true });
  if (Object.hasOwn(body, 'level')) result.level = text(body.level, 'level', { min: 2, max: 30, nullable: true });
  if (Object.hasOwn(body, 'schedule')) result.schedule = text(body.schedule, 'schedule', { min: 2, max: 500, nullable: true });
  if (Object.hasOwn(body, 'interests')) result.interests = validateInterests(body.interests);
  if (Object.hasOwn(body, 'career')) {
    result.career = text(body.career, 'career', { max: 150 });
    if (!Number.isInteger(body.cycle) || body.cycle < 1 || body.cycle > 65535) {
      throw new PublicError('VALIDATION_ERROR', { cycle: 'Selecciona un ciclo válido.' });
    }
    result.cycle = body.cycle;
  }
  return result;
}

export function validateOnboarding(body) {
  if (!plainObject(body) || Object.keys(body).sort().join(',') !== 'interests,level,schedule') {
    throw new PublicError('VALIDATION_ERROR', { general: 'Envía intereses, nivel y horario.' });
  }
  return {
    interests: validateInterests(body.interests, { required: true }),
    level: text(body.level, 'level', { min: 2, max: 30 }),
    schedule: text(body.schedule, 'schedule', { min: 2, max: 500 }),
  };
}

export function onboardingComplete(profile) {
  return Array.isArray(profile.interests) && profile.interests.length > 0 &&
    typeof profile.level === 'string' && profile.level.length > 0 &&
    typeof profile.schedule === 'string' && profile.schedule.length > 0;
}

function queryObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function validateDashboardQuery(query) {
  if (Object.keys(queryObject(query)).length !== 0) {
    throw new PublicError('VALIDATION_ERROR', { query: 'El dashboard no admite filtros ni identificadores de usuario.' });
  }
}

export function validateCreditsQuery(query) {
  const source = queryObject(query);
  if (Object.keys(source).some(key => !['limit', 'cursor'].includes(key)) ||
      Array.isArray(source.limit) || Array.isArray(source.cursor)) {
    throw new PublicError('VALIDATION_ERROR', { query: 'Usa únicamente limit y cursor.' });
  }
  const limit = source.limit === undefined ? 20 : Number(source.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || String(limit) !== String(source.limit ?? limit)) {
    throw new PublicError('VALIDATION_ERROR', { limit: 'Selecciona entre 1 y 50 movimientos.' });
  }
  if (source.cursor === undefined) return { limit, cursor: null };
  if (typeof source.cursor !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(source.cursor)) {
    throw new PublicError('VALIDATION_ERROR', { cursor: 'El cursor no es válido.' });
  }
  try {
    const decoded = Buffer.from(source.cursor, 'base64url').toString('utf8');
    if (Buffer.from(decoded).toString('base64url') !== source.cursor) throw new Error();
    const value = JSON.parse(decoded);
    if (!Array.isArray(value) || value.length !== 2 || !cursorTime.test(value[0]) || !uuid.test(value[1])) throw new Error();
    return { limit, cursor: { createdAt: value[0], id: value[1] } };
  } catch {
    throw new PublicError('VALIDATION_ERROR', { cursor: 'El cursor no es válido.' });
  }
}
