import { PublicError } from '../../errors/PublicError.js';

const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function text(value, field, maximum) {
  if (typeof value !== 'string' || !value.isWellFormed() || controls.test(value)) {
    throw new PublicError('VALIDATION_ERROR', { [field]: 'Usa un texto válido.' });
  }
  const normalized = value.trim();
  if (!normalized || [...normalized].length > maximum) {
    throw new PublicError('VALIDATION_ERROR', { [field]: `Usa entre 1 y ${maximum} caracteres.` });
  }
  return normalized;
}

export function validateAiChat(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['message', 'history'].includes(key))) {
    throw new PublicError('VALIDATION_ERROR', { general: 'Envía únicamente message e history.' });
  }
  const message = text(body.message, 'message', 1000);
  const source = body.history ?? [];
  if (!Array.isArray(source) || source.length > 6) {
    throw new PublicError('VALIDATION_ERROR', { history: 'Envía como máximo seis mensajes previos.' });
  }
  let total = 0;
  const history = source.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).some(key => !['role', 'content'].includes(key)) ||
        !['user', 'assistant'].includes(item.role)) {
      throw new PublicError('VALIDATION_ERROR', { history: `El mensaje histórico ${index + 1} no es válido.` });
    }
    const content = text(item.content, 'history', 1000);
    total += [...content].length;
    return { role: item.role, content };
  });
  if (total > 4000) throw new PublicError('VALIDATION_ERROR', { history: 'El historial supera el límite permitido.' });
  return { message, history };
}
