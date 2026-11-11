import { randomUUID } from 'node:crypto';
import { PublicError } from '../../errors/PublicError.js';
import { validatePdf, validatePhoto, validatePortfolioUrl } from './student-files.js';
import { createPrivateFileReader } from './private-file-reader.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function identifier(value, field) {
  if (typeof value !== 'string' || !uuid.test(value)) {
    throw new PublicError('VALIDATION_ERROR', { [field]: 'El identificador no es válido.' });
  }
  return value.toLowerCase();
}

function exactObject(value, fields, label = 'general') {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !fields.includes(key))) {
    throw new PublicError('VALIDATION_ERROR', { [label]: 'Envía únicamente los campos permitidos.' });
  }
  return value;
}

async function storedFile(storage, validated, purpose) {
  const storageKey = await storage.store(validated.buffer);
  return { id: randomUUID(), purpose, storageKey, mediaType: validated.mediaType,
    size: validated.size, sha256: validated.sha256 };
}

export function createMentorService(repository, storage, { onCleanupFailure = () => {} } = {}) {
  if (!repository || !storage) throw new Error('Mentor repository and private storage required');
  const readPrivateFile = createPrivateFileReader(storage);
  const cleanup = async key => {
    if (!key) return;
    try { await storage.remove(key); } catch { onCleanupFailure('PRIVATE_FILE_CLEANUP_REQUIRED'); }
  };
  return Object.freeze({
    requirements() {
      return { certificate: { required: true, mediaType: 'application/pdf', maximumBytes: 5 * 1024 * 1024 },
        portfolio: { required: false, accepted: ['https-url', 'application/pdf'], maximumFileBytes: 5 * 1024 * 1024 },
        photo: { required: false, mediaTypes: ['image/jpeg', 'image/png', 'image/webp'],
          maximumBytes: 2 * 1024 * 1024 },
        applicationStatuses: ['PENDING', 'APPROVED', 'REJECTED'] };
    },
    catalog() { return repository.catalog(); },
    ownSkills(userId) { return repository.ownSkills(userId); },
    setOwnSkill(userId, skillId, body) {
      exactObject(body, ['learning', 'teaching']);
      if (typeof body.learning !== 'boolean' || typeof body.teaching !== 'boolean') {
        throw new PublicError('VALIDATION_ERROR', { skill: 'Indica preferencias booleanas para aprender y enseñar.' });
      }
      return repository.setOwnSkill(userId, identifier(skillId, 'skillId'), body);
    },
    applications(userId) { return repository.applications(userId); },
    async createApplication(userId, multipart) {
      const fields = exactObject(multipart?.fields, ['skillId', 'portfolioUrl'], 'form');
      const files = exactObject(multipart?.files, ['certificate', 'portfolio'], 'file');
      const skillId = identifier(fields.skillId, 'skillId');
      if (!files.certificate) throw new PublicError('VALIDATION_ERROR', { certificate: 'Adjunta el certificado PDF.' });
      if (files.portfolio && fields.portfolioUrl) {
        throw new PublicError('VALIDATION_ERROR', { portfolio: 'Usa un enlace o un PDF de portafolio, no ambos.' });
      }
      const certificate = validatePdf(files.certificate);
      const portfolio = files.portfolio ? validatePdf(files.portfolio, 'portfolio') : null;
      const portfolioUrl = validatePortfolioUrl(fields.portfolioUrl);
      const committed = [];
      try {
        const certificateFile = await storedFile(storage, certificate, 'MENTOR_CERTIFICATE');
        committed.push(certificateFile.storageKey);
        let portfolioFile = null;
        if (portfolio) {
          portfolioFile = await storedFile(storage, portfolio, 'MENTOR_PORTFOLIO');
          committed.push(portfolioFile.storageKey);
        }
        return await repository.createApplication(userId, { id: randomUUID(), eventId: randomUUID(), skillId,
          certificate: certificateFile, portfolio: portfolioFile, portfolioUrl });
      } catch (error) {
        await Promise.all(committed.map(cleanup));
        throw error;
      }
    },
    async replaceCertificate(userId, applicationId, multipart) {
      const normalizedId = identifier(applicationId, 'applicationId');
      const fields = exactObject(multipart?.fields, [], 'form');
      const files = exactObject(multipart?.files, ['certificate'], 'file');
      void fields;
      if (!files.certificate) throw new PublicError('VALIDATION_ERROR', { certificate: 'Adjunta el certificado PDF.' });
      const value = await storedFile(storage, validatePdf(files.certificate), 'MENTOR_CERTIFICATE');
      try {
        const result = await repository.replaceCertificate(userId, normalizedId, { file: value, eventId: randomUUID() });
        await cleanup(result.oldStorageKey);
        return { id: normalizedId, status: result.status, certificateAttached: true };
      } catch (error) { await cleanup(value.storageKey); throw error; }
    },
    resubmit(userId, applicationId, body) {
      exactObject(body, []);
      return repository.resubmit(userId, identifier(applicationId, 'applicationId'), randomUUID());
    },
    async document(userId, applicationId, type) {
      const normalized = type === 'certificate' ? 'CERTIFICATE' : type === 'portfolio' ? 'PORTFOLIO' : null;
      if (!normalized) throw new PublicError('VALIDATION_ERROR', { document: 'Selecciona un documento permitido.' });
      return readPrivateFile(await repository.document(userId, identifier(applicationId, 'applicationId'), normalized));
    },
    async savePhoto(userId, multipart) {
      exactObject(multipart?.fields, [], 'form');
      const files = exactObject(multipart?.files, ['photo'], 'file');
      if (!files.photo) throw new PublicError('VALIDATION_ERROR', { photo: 'Adjunta una fotografía.' });
      const value = await storedFile(storage, validatePhoto(files.photo), 'PROFILE_PHOTO');
      try {
        const result = await repository.replacePhoto(userId, { file: value });
        await cleanup(result.oldStorageKey);
        return { available: true };
      } catch (error) { await cleanup(value.storageKey); throw error; }
    },
    async photo(userId) { return readPrivateFile(await repository.photo(userId)); },
    async deletePhoto(userId) {
      const result = await repository.deletePhoto(userId);
      await cleanup(result.oldStorageKey);
      return { deleted: result.deleted };
    },
  });
}
