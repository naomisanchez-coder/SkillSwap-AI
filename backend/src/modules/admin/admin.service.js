import { randomUUID } from 'node:crypto';
import { PublicError } from '../../errors/PublicError.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const level = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function identifier(value, field) {
  if (typeof value !== 'string' || !uuid.test(value)) throw new PublicError('VALIDATION_ERROR', { [field]: 'El identificador no es válido.' });
  return value.toLowerCase();
}
function exact(body, fields) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join(',') !== [...fields].sort().join(',')) {
    throw new PublicError('VALIDATION_ERROR', { general: 'Envía únicamente los campos requeridos.' });
  }
}
function reason(value) {
  if (typeof value !== 'string' || !value.isWellFormed() || /[\u0000-\u001f\u007f]/.test(value) ||
      [...value.trim()].length < 2 || [...value.trim()].length > 1000) {
    throw new PublicError('VALIDATION_ERROR', { reason: 'Indica un motivo de 2 a 1000 caracteres.' });
  }
  return value.trim();
}

export function createAdminService(repository, readPrivateFile) {
  if (!repository || !readPrivateFile) throw new Error('Admin dependencies required');
  return Object.freeze({
    pending(query) {
      if (!query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).some(key => key !== 'limit') ||
          Array.isArray(query.limit)) throw new PublicError('VALIDATION_ERROR', { query: 'Usa únicamente limit.' });
      const limit = query.limit === undefined ? 20 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 50 || String(limit) !== String(query.limit ?? limit)) {
        throw new PublicError('VALIDATION_ERROR', { limit: 'Selecciona entre 1 y 50 solicitudes.' });
      }
      return repository.pending(limit);
    },
    document(applicationId, type) {
      const normalized = type === 'certificate' ? 'CERTIFICATE' : type === 'portfolio' ? 'PORTFOLIO' : null;
      if (!normalized) throw new PublicError('VALIDATION_ERROR', { document: 'Selecciona un documento permitido.' });
      return repository.document(identifier(applicationId, 'applicationId'), normalized).then(readPrivateFile);
    },
    decide(adminId, applicationId, body) {
      exact(body, ['decision', 'reason']);
      const decision = typeof body.decision === 'string' ? body.decision.toUpperCase() : '';
      if (!['APPROVED', 'REJECTED'].includes(decision)) {
        throw new PublicError('VALIDATION_ERROR', { decision: 'Selecciona APPROVED o REJECTED.' });
      }
      return repository.decide(adminId, identifier(applicationId, 'applicationId'), decision,
        reason(body.reason), randomUUID());
    },
    assignLevel(adminId, offerId, body) {
      exact(body, ['levelCode']);
      if (typeof body.levelCode !== 'string' || !level.test(body.levelCode) || body.levelCode.length > 40) {
        throw new PublicError('VALIDATION_ERROR', { levelCode: 'Selecciona un nivel válido.' });
      }
      return repository.assignLevel(adminId, identifier(offerId, 'offerId'), body.levelCode);
    },
  });
}
