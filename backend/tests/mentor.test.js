import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PublicError } from '../src/errors/PublicError.js';
import { createMentorService } from '../src/modules/student/mentor.service.js';

const skillId = '123e4567-e89b-12d3-a456-426614174000';
const applicationId = '223e4567-e89b-12d3-a456-426614174000';
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('0000000d49484452', 'hex'),
  Buffer.alloc(17), Buffer.from('0000000049454e4400000000', 'hex')]);
png.writeUInt32BE(1, 16); png.writeUInt32BE(1, 20);

function fixture({ createError, cleanupError } = {}) {
  const stored = new Map(), removed = [], calls = [], cleanup = [];
  let count = 0;
  const storage = {
    async store(buffer) { const key = String(++count).padStart(64, '0'); stored.set(key, Buffer.from(buffer)); return key; },
    async read(key) { if (!stored.has(key)) throw Error(); return stored.get(key); },
    async remove(key) { removed.push(key); if (cleanupError) throw Error(); return stored.delete(key); },
  };
  const repository = {
    async catalog() { return []; }, async ownSkills() { return []; }, async setOwnSkill(id, skill, body) {
      calls.push(['skill', id, skill, body]); return { skillId: skill, ...body }; },
    async applications() { return []; },
    async createApplication(id, value) { calls.push(['create', id, value]); if (createError) throw new PublicError('CONFLICT');
      return { id: value.id, skillId: value.skillId, status: 'PENDING' }; },
    async replaceCertificate(id, app, value) { calls.push(['replace', id, app, value]);
      return { oldStorageKey: 'f'.repeat(64), status: 'PENDING' }; },
    async resubmit(id, app) { calls.push(['resubmit', id, app]); return { id: app, status: 'PENDING' }; },
    async document() { const buffer = pdf; return { storage_key: 'document', media_type: 'application/pdf',
      size_bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest() }; },
    async replacePhoto() { return { oldStorageKey: null }; },
    async photo() { return { storage_key: 'photo', media_type: 'image/png', size_bytes: png.length,
      sha256: createHash('sha256').update(png).digest() }; },
    async deletePhoto() { return { deleted: true, oldStorageKey: 'e'.repeat(64) }; },
  };
  stored.set('document', pdf); stored.set('photo', png);
  return { service: createMentorService(repository, storage, { onCleanupFailure: event => cleanup.push(event) }),
    stored, removed, calls, cleanup };
}

test('mentor application requires certificate, accepts optional portfolio and never self-approves', async () => {
  const f = fixture();
  const result = await f.service.createApplication('student', { fields: { skillId,
    portfolioUrl: 'https://portfolio.example/student' }, files: { certificate: {
    buffer: pdf, mediaType: 'application/pdf' } } });
  assert.equal(result.status, 'PENDING');
  const value = f.calls.find(call => call[0] === 'create')[2];
  assert.equal(value.portfolioUrl, 'https://portfolio.example/student');
  assert.equal(value.certificate.purpose, 'MENTOR_CERTIFICATE');
  assert.ok(!Object.hasOwn(value, 'role') && !Object.hasOwn(value, 'approved'));
  await assert.rejects(f.service.createApplication('student', { fields: { skillId }, files: {} }),
    error => error.code === 'VALIDATION_ERROR');
});

test('stored files are compensated when database creation fails and cleanup failures are signalled safely', async () => {
  const f = fixture({ createError: true });
  await assert.rejects(f.service.createApplication('student', { fields: { skillId }, files: {
    certificate: { buffer: pdf, mediaType: 'application/pdf' } } }), error => error.code === 'CONFLICT');
  assert.equal(f.removed.length, 1);
  const g = fixture({ createError: true, cleanupError: true });
  await assert.rejects(g.service.createApplication('student', { fields: { skillId }, files: {
    certificate: { buffer: pdf, mediaType: 'application/pdf' } } }));
  assert.deepEqual(g.cleanup, ['PRIVATE_FILE_CLEANUP_REQUIRED']);
});

test('skills, resubmission, certificate replacement and profile photo remain owner-scoped', async () => {
  const f = fixture();
  assert.deepEqual(await f.service.setOwnSkill('student', skillId, { learning: true, teaching: false }),
    { skillId, learning: true, teaching: false });
  assert.equal((await f.service.resubmit('student', applicationId, {})).status, 'PENDING');
  const replaced = await f.service.replaceCertificate('student', applicationId, { fields: {}, files: {
    certificate: { buffer: pdf, mediaType: 'application/pdf' } } });
  assert.equal(replaced.certificateAttached, true);
  assert.equal((await f.service.savePhoto('student', { fields: {}, files: {
    photo: { buffer: png, mediaType: 'image/png' } } })).available, true);
  assert.equal((await f.service.photo('student')).mediaType, 'image/png');
  assert.equal((await f.service.document('student', applicationId, 'certificate')).mediaType, 'application/pdf');
  assert.deepEqual(await f.service.deletePhoto('student'), { deleted: true });
});
