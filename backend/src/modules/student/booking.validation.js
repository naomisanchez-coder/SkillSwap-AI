import { PublicError } from '../../errors/PublicError.js';

export const sessionCosts = Object.freeze({ 30: 5, 60: 10, 90: 15 });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function exact(value, fields, label = 'general') {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !fields.includes(key))) {
    throw new PublicError('VALIDATION_ERROR', { [label]: 'Envía únicamente los campos permitidos.' });
  }
  return value;
}

export function identifier(value, field) {
  if (typeof value !== 'string' || !uuid.test(value)) {
    throw new PublicError('VALIDATION_ERROR', { [field]: 'El identificador no es válido.' });
  }
  return value.toLowerCase();
}

export function validateBooking(body) {
  exact(body, ['requestId', 'offerId', 'startsAt', 'durationMinutes']);
  const duration = Number(body.durationMinutes);
  if (!Number.isInteger(duration) || !Object.hasOwn(sessionCosts, duration)) {
    throw new PublicError('VALIDATION_ERROR', { durationMinutes: 'Selecciona 30, 60 o 90 minutos.' });
  }
  if (typeof body.startsAt !== 'string' || !isoUtc.test(body.startsAt) || !Number.isFinite(Date.parse(body.startsAt))) {
    throw new PublicError('VALIDATION_ERROR', { startsAt: 'Usa una fecha UTC válida.' });
  }
  return { requestId: identifier(body.requestId, 'requestId'), offerId: identifier(body.offerId, 'offerId'),
    startsAt: new Date(body.startsAt), durationMinutes: duration, creditCost: sessionCosts[duration] };
}

export function validateAvailability(body) {
  exact(body, ['slots']);
  if (!Array.isArray(body.slots) || body.slots.length > 50) {
    throw new PublicError('VALIDATION_ERROR', { slots: 'Envía como máximo 50 bloques.' });
  }
  const slots = body.slots.map((value, index) => {
    exact(value, ['weekday', 'start', 'end'], 'slots');
    if (!Number.isInteger(value.weekday) || value.weekday < 1 || value.weekday > 7 ||
        typeof value.start !== 'string' || typeof value.end !== 'string' ||
        !clock.test(value.start) || !clock.test(value.end) || value.start >= value.end) {
      throw new PublicError('VALIDATION_ERROR', { slots: `El bloque ${index + 1} no es válido.` });
    }
    return { weekday: value.weekday, start: value.start, end: value.end };
  }).sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  for (let index = 1; index < slots.length; index++) {
    if (slots[index - 1].weekday === slots[index].weekday && slots[index - 1].end > slots[index].start) {
      throw new PublicError('VALIDATION_ERROR', { slots: 'Los bloques de disponibilidad no deben superponerse.' });
    }
  }
  return slots;
}

export function validateOffer(body) {
  exact(body, ['active']);
  if (typeof body.active !== 'boolean') throw new PublicError('VALIDATION_ERROR', { active: 'Indica un estado booleano.' });
  return { active: body.active };
}

export function validateMeeting(body) {
  exact(body, ['url']);
  try {
    const url = new URL(body.url);
    const host = url.hostname.toLowerCase();
    const allowed = host === 'meet.google.com' || host === 'zoom.us' || host.endsWith('.zoom.us') ||
      host === 'webex.com' || host.endsWith('.webex.com');
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || !allowed || url.href.length > 2048) throw new Error();
    return url.href;
  } catch { throw new PublicError('VALIDATION_ERROR', { url: 'Usa un enlace HTTPS de Google Meet, Zoom o Webex.' }); }
}

export function validateEmpty(body) {
  exact(body, []);
}

export function validateReview(body) {
  exact(body, ['rating', 'comment']);
  if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
    throw new PublicError('VALIDATION_ERROR', { rating: 'Selecciona una valoración entera entre 1 y 5.' });
  }
  let comment = null;
  if (body.comment !== undefined && body.comment !== null && body.comment !== '') {
    if (typeof body.comment !== 'string' || !body.comment.isWellFormed() || /[\u0000-\u001f\u007f]/.test(body.comment) ||
        body.comment.trim().length < 1 || [...body.comment.trim()].length > 1000) {
      throw new PublicError('VALIDATION_ERROR', { comment: 'Usa un comentario válido de hasta 1000 caracteres.' });
    }
    comment = body.comment.trim();
  }
  return { rating: body.rating, comment };
}

export function validateSessionsQuery(query) {
  const source = query && typeof query === 'object' && !Array.isArray(query) ? query : {};
  if (Object.keys(source).some(key => !['status', 'limit'].includes(key)) ||
      Array.isArray(source.status) || Array.isArray(source.limit)) {
    throw new PublicError('VALIDATION_ERROR', { query: 'Usa únicamente status y limit.' });
  }
  const allowed = ['UPCOMING', 'ACTIVE', 'AWAITING_VALIDATION', 'COMPLETED', 'CANCELLED'];
  const status = source.status === undefined ? null : String(source.status).toUpperCase();
  if (status && !allowed.includes(status)) throw new PublicError('VALIDATION_ERROR', { status: 'Selecciona un estado válido.' });
  const limit = source.limit === undefined ? 20 : Number(source.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || String(limit) !== String(source.limit ?? limit)) {
    throw new PublicError('VALIDATION_ERROR', { limit: 'Selecciona entre 1 y 50 sesiones.' });
  }
  return { status, limit };
}

export function limaSlot(date, durationMinutes) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(part => [part.type, part.value]));
  const weekdays = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const end = minutes + durationMinutes;
  if (end > 24 * 60) {
    throw new PublicError('VALIDATION_ERROR', {
      startsAt: 'La sesión debe comenzar y terminar el mismo día en America/Lima.',
    });
  }
  return { weekday: weekdays[parts.weekday], start: `${parts.hour}:${parts.minute}:00`,
    end: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}:00` };
}
