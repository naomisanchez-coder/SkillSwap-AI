import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalAccountStore, accountStorageKey, type AccountFiles } from '../src/dev/accountStore';
import { AccountError, normalizeApplication, normalizePersonalProfile, type ApplicationCommand } from '../src/data/account';
import { MAX_EVIDENCE_PDF_SIZE, validateEvidencePdf } from '../src/data/evidenceStorage';
import { MAX_PROFILE_PHOTO_SIZE, validateProfilePhoto } from '../src/data/profilePhotoStorage';

const pdf = (name = 'certificado.pdf') => new File(['%PDF-1.7\nContenido de prueba\n%%EOF'], name, { type: 'application/pdf' });
const code = (value: string) => (error: unknown) => error instanceof AccountError && error.code === value;
function fixture() {
  const values = new Map<string, string>(); let fail = false; let fileFail = false;
  const documents = new Map<string, Blob>(); const photos = new Map<string, Blob>();
  const files: AccountFiles = {
    validateEvidence: validateEvidencePdf,
    async saveEvidence(file) { if (fileFail) throw new Error('Fallo de IndexedDB'); const id = crypto.randomUUID(); documents.set(id, file); return id; },
    async getEvidence(id) { return documents.get(id) ?? null; }, async removeEvidence(id) { documents.delete(id); },
    async savePhoto(_userId, file) { if (fileFail) throw new Error('Fallo de IndexedDB'); const id = crypto.randomUUID(); photos.set(id, file); return id; },
    async getPhoto(id) { return photos.get(id) ?? null; }, async removePhoto(id) { photos.delete(id); },
  };
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { if (fail) throw new Error('Quota'); values.set(key, value); } };
  const options = { storage: () => storage, identity: { id: 'current', name: 'Estudiante' }, files, now: () => new Date('2030-01-01T12:00:00Z') };
  const service = createLocalAccountStore(options);
  const command: ApplicationCommand = { id: 'REQ-test', submissionId: 'SUB-test', skill: 'Python', level: 'Intermedio', experience: 'Experiencia con Python', topics: 'Variables y funciones', portfolio: 'https://example.test/proyecto', evidenceFile: pdf() };
  return { service, options, values, files, documents, photos, command, failStorage: (value: boolean) => { fail = value; }, failFiles: (value: boolean) => { fileFail = value; } };
}

test('PDF: extensión, MIME, vacío, firma y límite exacto de 5 MB', async () => {
  assert.equal(await validateEvidencePdf(pdf()), null);
  assert.equal(await validateEvidencePdf(new File([pdf()], 'PDF.PDF', { type: '' })), null);
  for (const file of [pdf('archivo.txt'), new File([pdf()], 'archivo.pdf', { type: 'image/png' }), new File([], 'vacio.pdf'), new File(['texto renombrado'], 'falso.pdf', { type: 'application/pdf' }), new File(['%PDF-1.7', new Uint8Array(MAX_EVIDENCE_PDF_SIZE)], 'grande.pdf')]) assert.notEqual(await validateEvidencePdf(file), null);
  assert.equal(await validateEvidencePdf(new File(['%PDF-1.7', new Uint8Array(MAX_EVIDENCE_PDF_SIZE - 8)], 'limite.pdf', { type: 'application/pdf' })), null);
});
test('foto: JPG/PNG/WebP, vacío y límite de 2 MB', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.equal(validateProfilePhoto(new File([new Uint8Array(MAX_PROFILE_PHOTO_SIZE)], 'foto', { type })), null);
  for (const file of [new File(['x'], 'foto.svg', { type: 'image/svg+xml' }), new File([], 'vacio.png', { type: 'image/png' }), new File([new Uint8Array(MAX_PROFILE_PHOTO_SIZE + 1)], 'grande.png', { type: 'image/png' })]) assert.notEqual(validateProfilePhoto(file), null);
});
test('validaciones de nombre, biografía, habilidad activa, nivel, experiencia, temas y URL HTTPS', () => {
  assert.deepEqual(normalizePersonalProfile({ name: ' Ana Díaz ', bio: ' Texto ' }), { name: 'Ana Díaz', bio: 'Texto' });
  for (const value of [{ name: '', bio: '' }, { name: 'x'.repeat(121), bio: '' }, { name: 'Ana', bio: 'x'.repeat(1001) }]) assert.throws(() => normalizePersonalProfile(value), code('validation'));
  const { command } = fixture();
  for (const patch of [{ skill: 'No existe' }, { level: 'Principiante' }, { experience: ' ' }, { experience: 'x'.repeat(2001) }, { topics: '' }, { portfolio: 'https://' }, { portfolio: 'http://example.test' }, { portfolio: 'https://user:pass@example.test' }]) assert.throws(() => normalizeApplication({ ...command, ...patch } as typeof command), code('validation'));
});
test('edición de perfil y foto sobreviven a recarga sin tocar preferencias, reservas ni foto anterior', async () => {
  const f = fixture(); f.values.set('preferences', 'mantener'); f.values.set('bookings', 'mantener');
  await f.service.saveProfile({ name: 'Ana', bio: 'Desarrollo de software' });
  const one = await f.service.savePhoto(new File(['imagen1'], 'a.png', { type: 'image/png' }));
  const two = await f.service.savePhoto(new File(['imagen2'], 'b.png', { type: 'image/png' }));
  const loaded = await createLocalAccountStore(f.options).getAccount();
  assert.equal(loaded.profile.name, 'Ana'); assert.equal(loaded.profile.bio, 'Desarrollo de software');
  assert.notEqual(one.profile.photoStorageId, two.profile.photoStorageId); assert.equal(f.photos.size, 2);
  assert.equal(await (await f.service.getPhoto(two.profile.photoStorageId!))!.text(), 'imagen2');
  assert.equal(f.values.get('preferences'), 'mantener'); assert.equal(f.values.get('bookings'), 'mantener');
});
test('solicitudes y evidencias persisten; diez envíos idénticos crean una solicitud y un documento', async () => {
  const f = fixture(); await Promise.all(Array.from({ length: 10 }, () => f.service.submitApplication(f.command)));
  const account = await createLocalAccountStore(f.options).getAccount();
  assert.equal(account.requests.length, 1); assert.equal(account.notifications.length, 1); assert.equal(f.documents.size, 1);
  const request = account.requests[0]; assert.equal(request.status, 'pending'); assert.equal(request.evidenceName, 'certificado.pdf');
  assert.equal(await (await f.service.getEvidence(request.evidenceStorageId!))!.text(), await f.command.evidenceFile!.text());
  await assert.rejects(f.service.submitApplication({ ...f.command, topics: 'Otros temas' }), code('id_conflict'));
  await assert.rejects(f.service.submitApplication({ ...f.command, id: 'REQ-other', submissionId: 'SUB-other' }), code('duplicate'));
});
test('observación/rechazo se conservan en historial al corregir con el mismo ID; aprobación bloquea duplicados', async () => {
  const f = fixture(); let account = await f.service.submitApplication(f.command);
  for (const [index, status] of ['observation', 'rejected'].entries()) {
    account = await f.service.reviewFixture(f.command.id, status as 'observation' | 'rejected', `Observación ${index}`);
    assert.equal(account.requests[0].adminComment, `Observación ${index}`);
    account = await f.service.submitApplication({ ...f.command, submissionId: `SUB-${index}`, evidenceFile: undefined, evidenceStorageId: account.requests[0].evidenceStorageId, topics: `Temas corregidos ${index}` });
    assert.equal(account.requests[0].id, f.command.id); assert.equal(account.requests[0].status, 'pending');
  }
  assert.equal(account.requests[0].history.filter(item => item.comment?.startsWith('Observación')).length, 2);
  await f.service.reviewFixture(f.command.id, 'approved', 'Validada');
  await assert.rejects(f.service.submitApplication({ ...f.command, id: 'REQ-new', submissionId: 'SUB-new' }), code('duplicate'));
});
test('falla de metadatos: no informa éxito, retira solo archivo nuevo y permite reintentar', async () => {
  const f = fixture(); const old = await f.service.savePhoto(new File(['foto previa'], 'a.png', { type: 'image/png' }));
  const before = f.values.get(accountStorageKey); f.failStorage(true);
  await assert.rejects(f.service.savePhoto(new File(['foto nueva'], 'b.png', { type: 'image/png' })), code('storage_failed'));
  await assert.rejects(f.service.submitApplication(f.command), code('storage_failed'));
  await assert.rejects(f.service.saveProfile({ name: 'Cambio', bio: '' }), code('storage_failed'));
  assert.equal(f.values.get(accountStorageKey), before); assert.equal(f.documents.size, 0); assert.equal(f.photos.size, 1); assert(f.photos.has(old.profile.photoStorageId!));
  f.failStorage(false); await f.service.submitApplication(f.command); assert.equal((await f.service.getAccount()).requests.length, 1);
});
test('falla de archivos y recuperación ausente no borran solicitudes; evidencia ajena y datos corruptos se rechazan', async () => {
  const f = fixture(); f.failFiles(true); await assert.rejects(f.service.submitApplication(f.command), /IndexedDB/); assert.equal((await f.service.getAccount()).requests.length, 0);
  f.failFiles(false); const account = await f.service.submitApplication(f.command); const id = account.requests[0].evidenceStorageId!;
  f.documents.delete(id); assert.equal(await f.service.getEvidence(id), null);
  await f.service.reviewFixture(f.command.id, 'observation', 'Adjuntar nuevamente');
  await assert.rejects(f.service.submitApplication({ ...f.command, submissionId: 'SUB-retry', evidenceFile: undefined, evidenceStorageId: id }), code('evidence_missing'));
  await assert.rejects(f.service.getEvidence('foreign'), code('not_found'));
  f.values.set(accountStorageKey, '{broken'); await assert.rejects(f.service.getAccount(), code('storage_invalid')); assert.equal(f.values.get(accountStorageKey), '{broken');
});
