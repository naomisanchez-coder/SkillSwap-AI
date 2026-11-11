import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMentorDetails } from '../src/modules/student/mentor-details.validation.js';
import { createMentorService } from '../src/modules/student/mentor.service.js';
import { createMentorRepository } from '../src/modules/student/mentor.repository.js';
import { readMigration, readMigrations, latestMigration } from '../database/migrate.js';
const applicationId = '123e4567-e89b-42d3-a456-426614174000';
const details = { declaredLevel: 'Avanzado', experience: 'Experiencia de prueba\nSegunda línea', topics: 'Temas de prueba' };

test('009 incremental: una tabla nueva, sin DDL destructivo, datos ficticios ni cambios en aprobaciones', async () => {
  assert.equal(latestMigration, '009_mentor_application_details');
  const migrations = await readMigrations(latestMigration);
  assert.equal(migrations.length, 9);
  const migration = await readMigration(latestMigration);
  assert.equal(migration.statements.length, 4);
  const sql = migration.statements.join('\n');
  assert.match(sql, /CREATE TABLE mentor_application_details/);
  assert.match(sql, /FOREIGN KEY \(application_id\) REFERENCES mentor_applications/);
  assert.doesNotMatch(sql, /\b(?:DROP|ALTER|DELETE|TRUNCATE|UPDATE)\s+(?:TABLE|mentor_|users)/i);
  assert.doesNotMatch(sql, /INSERT INTO (?!schema_migrations)/);
  assert.equal(migrations[7].checksum, '9f1cdc5fa257d9c2695bb4bc72a86566b26b7198ba5187f47f78a96083579cae');
});
test('declaraciones: nivel de enseñanza independiente y textos validados sin aceptar vacíos ni controles', () => {
  assert.deepEqual(validateMentorDetails(details), details);
  for (const value of [{ ...details, declaredLevel: '' }, { ...details, declaredLevel: 'ADMIN' }, { ...details, experience: '' }, { ...details, topics: 'x'.repeat(2001) }, { ...details, topics: 'bad\0value' }]) assert.throws(() => validateMentorDetails(value), error => error.code === 'VALIDATION_ERROR');
});
test('sin migración no se almacena archivo ni se descartan declaraciones', async () => {
  let stored = 0;
  const service = createMentorService({ detailsAvailable: false }, { async store() { stored++; }, async read() {} });
  await assert.rejects(service.createApplication('owner', { fields: { skillId: applicationId, ...details }, files: { certificate: {} } }), error => error.code === 'APPLICATION_DETAILS_UNAVAILABLE');
  assert.equal(stored, 0); assert.equal(service.requirements().applicationDetails.available, false);
});
test('actualizar declaración: validación y autorización impiden autoaprobación y propiedad inyectada', () => {
  let called = false;
  const service = createMentorService({ detailsAvailable: true, updateApplication(owner, id, value) { called = true; return { owner, id, value }; } }, { async read() {} });
  const result = service.updateApplication('owner', applicationId, { ...details, portfolioUrl: null });
  assert.equal(result.owner, 'owner'); assert.deepEqual(result.value, { ...details, portfolioUrl: null });
  called = false;
  for (const payload of [{ ...details, status: 'APPROVED' }, { ...details, userId: 'other' }, { ...details, approvedLevel: 'Avanzado' }]) assert.throws(() => service.updateApplication('owner', applicationId, payload), error => error.code === 'VALIDATION_ERROR');
  assert.equal(called, false);
});
test('repositorio: guarda las declaraciones y conserva estado; rechaza APPROVED y otro propietario antes de escribir', async () => {
  let status = 'PENDING'; let writes = [];
  const db = { async transaction(work) { return work(this); }, async execute(sql, values) {
    if (sql.startsWith('SELECT')) return [values[1] === 'owner' ? [{ id: applicationId, status }] : []];
    writes.push({ sql, values }); return [{}];
  } };
  const repository = createMentorRepository(db, { detailsAvailable: true });
  for (const state of ['PENDING', 'REJECTED']) {
    status = state; writes = [];
    const result = await repository.updateApplication('owner', applicationId, { ...details, portfolioUrl: null });
    assert.equal(result.status, state); assert.equal(writes.length, 2);
    assert.equal(writes[0].values[1], details.declaredLevel);
    assert.ok(writes.every(w => !/mentor_skill_levels|SET status|student_profile_details/.test(w.sql)));
  }
  status = 'APPROVED'; writes = [];
  await assert.rejects(repository.updateApplication('owner', applicationId, details), error => error.code === 'CONFLICT'); assert.equal(writes.length, 0);
  status = 'PENDING';
  await assert.rejects(repository.updateApplication('other', applicationId, details), error => error.code === 'FORBIDDEN'); assert.equal(writes.length, 0);
});
