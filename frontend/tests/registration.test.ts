import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateRegistrationForm, type RegistrationFormValues } from '../src/data/registrationValidation';
import { normalizeTecsupEmail, TECSUP_CAREERS, ACADEMIC_CYCLES } from '../src/data/academicCatalog';
import { LEGAL_VERSIONS, registerStudent, RegistrationError } from '../src/services/registration';

const form: RegistrationFormValues = { firstName: 'Sheila', lastName: 'Díaz', email: 'sheila.diaz@tecsup.edu.pe', career: TECSUP_CAREERS[0], cycle: '3', password: 'Solo-prueba-123', confirmPassword: 'Solo-prueba-123', accepted: true };
const input = { firstName: form.firstName, lastName: form.lastName, email: form.email, career: form.career, cycle: 3, password: form.password, termsAccepted: true as const, termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy };
const signal = () => new AbortController().signal;
test('registro: catálogo versionado de 14 carreras y ciclos, correo normalizado y formato estricto', () => {
  assert.equal(TECSUP_CAREERS.length, 14); assert.deepEqual(ACADEMIC_CYCLES, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(validateRegistrationForm({ ...form, email: ' SHEILA.DIAZ@TECSUP.EDU.PE ' }), {});
  assert.equal(normalizeTecsupEmail(' SHEILA.DIAZ@TECSUP.EDU.PE '), form.email);
  for (const email of ['sheila@tecsup.edu.pe', 'sheila_diaz@tecsup.edu.pe', 'sheila,diaz@tecsup.edu.pe', 'sheila1.diaz@tecsup.edu.pe', 'sheila.diaz+test@tecsup.edu.pe', 'sheila.diaz.otro@tecsup.edu.pe', 'sheila..diaz@tecsup.edu.pe', 'sheila.díaz@tecsup.edu.pe', 'sheila.diaz@sub.tecsup.edu.pe', 'sheila.diaz@gmail.com']) assert(validateRegistrationForm({ ...form, email }).email, email);
  for (const career of TECSUP_CAREERS) assert.deepEqual(validateRegistrationForm({ ...form, career }), {});
  assert(validateRegistrationForm({ ...form, career: 'Administración de Redes y Comunicaciones' }).career);
  assert(validateRegistrationForm({ ...form, cycle: '7' }).cycle);
});
test('registro: límites Unicode, controles, confirmación y aceptación obligatoria', () => {
  for (const password of ['😀'.repeat(8), '😀'.repeat(128), '  clave con espacios  ']) assert.deepEqual(validateRegistrationForm({ ...form, password, confirmPassword: password }), {});
  for (const password of ['😀'.repeat(7), '😀'.repeat(129), '1234567\ud800']) assert(validateRegistrationForm({ ...form, password, confirmPassword: password }).password);
  assert.deepEqual(validateRegistrationForm({ ...form, firstName: '😀'.repeat(100) }), {});
  for (const firstName of ['A', '😀'.repeat(101), 'Ana\u0000', 'Ana\ud800']) assert(validateRegistrationForm({ ...form, firstName }).firstName);
  assert(validateRegistrationForm({ ...form, confirmPassword: 'otra' }).confirm);
  assert(validateRegistrationForm({ ...form, accepted: false }).terms);
});
test('registro HTTP: POST público exacto, sin cookie ni reintentos y respuesta mínima 201', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls++; assert.equal(url, 'http://127.0.0.1:4000/api/auth/register'); assert.equal(options.method, 'POST'); assert.equal(options.credentials, 'omit');
    assert.deepEqual(JSON.parse(options.body as string), input);
    return new Response(JSON.stringify({ user: { email: input.email, role: 'student', emailVerified: false, onboardingComplete: false } }), { status: 201 });
  });
  assert.deepEqual(await registerStudent(input, signal(), 'http://127.0.0.1:4000/api/'), { email: input.email }); assert.equal(calls, 1);
});
test('registro HTTP: campos 422, duplicado 409, espera 429, indisponibilidad y respuesta no confirmada', async t => {
  let response = new Response();
  t.mock.method(globalThis, 'fetch', async () => response);
  const cases = [
    [422, { error: { code: 'VALIDATION_ERROR', fields: { firstName: 'Nombre inválido', termsVersion: 'Versión anterior', ignored: 'no mostrar' } } }, 'terms'],
    [409, { error: { code: 'EMAIL_ALREADY_REGISTERED' } }, 'email'],
    [429, { error: { code: 'RATE_LIMITED' } }, 'general'],
    [503, { error: { code: 'SERVICE_UNAVAILABLE' } }, 'general'],
    [201, { user: { email: input.email, role: 'admin' } }, 'general'],
    [500, null, 'general'],
  ] as const;
  for (const [status, body, field] of cases) {
    response = new Response(JSON.stringify(body), { status, headers: { 'Retry-After': '2' } });
    await assert.rejects(registerStudent(input, signal(), 'http://127.0.0.1:4000/api'), error => {
      assert(error instanceof RegistrationError); assert(error.fields[field]); assert(!error.fields.ignored);
      if (status === 429) assert.equal(error.retryAfterSeconds, 2); return true;
    });
  }
  response = new Response('{}', { status: 429, headers: { 'Retry-After': 'invalid' } });
  await assert.rejects(registerStudent(input, signal(), 'http://127.0.0.1:4000/api'), error => error instanceof RegistrationError && error.retryAfterSeconds === undefined);
  response = new Response('{}', { status: 429, headers: { 'Retry-After': new Date(Date.now() + 60000).toUTCString() } });
  await assert.rejects(registerStudent(input, signal(), 'http://127.0.0.1:4000/api'), error => error instanceof RegistrationError && Boolean(error.retryAfterSeconds && error.retryAfterSeconds <= 60));
});
test('registro HTTP: red y configuración inválida no reenvían solicitudes', async t => {
  let calls = 0; t.mock.method(globalThis, 'fetch', async () => { calls++; throw new TypeError('offline'); });
  await assert.rejects(registerStudent(input, signal(), 'http://127.0.0.1:4000/api'), RegistrationError); assert.equal(calls, 1);
  for (const url of ['', 'javascript:alert(1)', 'http://user:secret@example.test/api', 'http://example.test/api?x=1']) await assert.rejects(registerStudent(input, signal(), url), RegistrationError);
  assert.equal(calls, 1);
});
test('documentos legales completos, versiones 1.0.0 y pendientes conservados', () => {
  assert.deepEqual(LEGAL_VERSIONS, { terms: '1.0.0', privacy: '1.0.0' });
  for (const file of ['terms', 'privacy']) {
    const text = readFileSync(new URL(`../src/data/legal/${file}-1.0.0.md`, import.meta.url), 'utf8');
    assert(text.includes('Versión 1.0.0.')); assert(text.includes('pendientes de completar con datos reales')); assert(text.length > 4000);
  }
});
