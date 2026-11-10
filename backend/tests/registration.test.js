import test from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { validateRegistration } from '../src/modules/auth/auth.validation.js';
import { hashPassword } from '../src/modules/auth/password.service.js';
import { createAuthRepository } from '../src/modules/auth/auth.repository.js';

// Approved policy, shared with the service.
const policy = { minLength: 8, maxLength: 128, termsVersion: '1.0.0', privacyVersion: '1.0.0' };
const valid = () => ({ firstName: 'Prueba', lastName: 'Aislada', email: 'prueba.aislada@tecsup.edu.pe',
  career: 'Catalogo sintetico', cycle: 3, password: randomBytes(16).toString('hex'),
  termsAccepted: true, termsVersion: '1.0.0', privacyVersion: '1.0.0' });
const validationError = (error) => error.code === 'VALIDATION_ERROR' && error.status === 422;

test('nine-field validator normalizes only expected fields and preserves password bytes', () => {
  const input = { ...valid(), email: ' PRUEBA.AISLADA@TECSUP.EDU.PE ', firstName: ' Prueba ', password: '  clave de prueba  ' };
  const output = validateRegistration(input, policy);
  assert.equal(output.email, 'prueba.aislada@tecsup.edu.pe');
  assert.equal(output.firstName, 'Prueba');
  assert.equal(output.password, input.password);
});

test('institutional validator rejects domains, aliases, malformed addresses and extra segments', () => {
  for (const email of ['prueba.aislada@gmail.com', 'prueba.aislada@demo.pe',
    'prueba.aislada@tecsup.edu.pe.evil.com', 'prueba.aislada@sub.tecsup.edu.pe',
    'prueba.aislada@tecsup-edu.pe', 'pruebaaislada@tecsup.edu.pe',
    'prueba.aislada+alias@tecsup.edu.pe', 'prueba. aislada@tecsup.edu.pe',
    '.prueba@tecsup.edu.pe', 'prueba..aislada@tecsup.edu.pe', 'a.b.c@tecsup.edu.pe']) {
    assert.throws(() => validateRegistration({ ...valid(), email }, policy), validationError);
  }
});

test('missing fields, incorrect types and bounded passwords return safe field errors', () => {
  for (const field of Object.keys(valid())) {
    const input = valid(); delete input[field];
    assert.throws(() => validateRegistration(input, policy), validationError);
  }
  for (const patch of [{ cycle: '3' }, { cycle: 1.5 }, { cycle: 0 }, { password: 'short' },
    { password: 'x'.repeat(129) }, { firstName: 'a' }, { career: 'x'.repeat(151) },
    { lastName: 'bad\nname' }, { password: 'x'.repeat(8) + '\ud800' }, { firstName: 'ab\ud800' }]) {
    assert.throws(() => validateRegistration({ ...valid(), ...patch }, policy), validationError);
  }
  for (const input of [null, [], 'text', 4]) assert.throws(() => validateRegistration(input, policy), validationError);
  assert.throws(() => validateRegistration(valid(), {}), (e) => e.code === 'SERVICE_UNAVAILABLE');
});

test('injection of roles, credits, flags and undeclared fields is rejected', () => {
  for (const patch of [{ role: 'ADMIN' }, { credits: 20 }, { emailVerified: true }, { privileges: ['admin'] },
    { confirmPassword: 'anything' }, { area: 'injected' }, { department: 'injected' }, { faculty: 'injected' }, JSON.parse('{"__proto__":{"role":"ADMIN"}}')]) {
    assert.throws(() => validateRegistration({ ...valid(), ...patch }, policy), validationError);
  }
});

test('native scrypt hashes are salted, bounded, nonplaintext and cryptographically valid', { timeout: 30000 }, async () => {
  const password = randomBytes(20).toString('hex');
  const [one, two] = await Promise.all([hashPassword(password), hashPassword(password)]);
  assert.notEqual(one, two);
  assert.ok(!one.includes(password));
  assert.ok(one.length <= 255);
  const parts = one.split('$');
  assert.equal(parts[1], 'scrypt');
  assert.equal(parts[2], 'N=131072,r=8,p=1');
  const derived = await promisify(scrypt)(password, Buffer.from(parts[3], 'hex'), 32,
    { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  assert.ok(timingSafeEqual(derived, Buffer.from(parts[4], 'hex')));
  derived.fill(0);
});

test('hashing rejects unbounded inputs and excess concurrent derivations without logging input', { timeout: 30000 }, async () => {
  await assert.rejects(hashPassword(''), TypeError);
  await assert.rejects(hashPassword('x'.repeat(513)), TypeError);
  const one = hashPassword(randomBytes(16).toString('hex'));
  const two = hashPassword(randomBytes(16).toString('hex'));
  await assert.rejects(hashPassword(randomBytes(16).toString('hex')), (e) => e.code === 'SERVICE_UNAVAILABLE');
  await Promise.all([one, two]);
});

function fakeDatabase({ careers = [{ id: 'career-id', is_active: 1 }], cycles = [{ cycle: 3 }], failProfile, duplicate } = {}) {
  const calls = [];
  const original = new Error('internal failure');
  if (duplicate) original.code = 'ER_DUP_ENTRY';
  const database = {
    async transaction(work) {
      calls.push('begin');
      try {
        const result = await work({ async execute(sql, values) {
          calls.push({ sql, values });
          if (sql.startsWith('SELECT id, is_active')) return [careers];
          if (sql.startsWith('SELECT cycle')) return [cycles];
          if (sql.includes('INSERT INTO users') && duplicate) throw original;
          if (sql.startsWith('INSERT INTO student_profiles') && failProfile) throw original;
          return [{ affectedRows: 1 }];
        } });
        calls.push('commit'); return result;
      } catch (error) { calls.push('rollback'); throw error; }
    },
    async execute(sql) { calls.push({ sql }); return [[{ id: 'existing-user' }]]; },
  };
  return { repository: createAuthRepository(database), calls, original };
}
const repositoryInput = () => ({ ...valid(), passwordHash: '$synthetic$' + randomBytes(32).toString('hex'),
  termsAcceptedAt: new Date(), termsVersion: 'isolated-test', privacyVersion: 'isolated-test' });

test('repository creates only pending STUDENT and profile in one transaction without credits/sessions', async () => {
  const f = fakeDatabase();
  const input = repositoryInput();
  const output = await f.repository.createStudent(input);
  assert.equal(output.email, input.email);
  assert.deepEqual(f.calls.filter((c) => typeof c === 'string'), ['begin', 'commit']);
  const queries = f.calls.filter((c) => typeof c === 'object');
  assert.equal(queries.length, 4);
  assert.ok(queries[2].sql.includes("'STUDENT', 'PENDING_VERIFICATION'"));
  assert.ok(!queries[2].values.includes(input.password));
  assert.equal(queries[2].values[4], input.passwordHash);
  assert.equal(queries[3].values[0], output.id);
  assert.ok(queries.every((q) => !q.sql.includes('credit_transactions') && !q.sql.includes('auth_sessions')));
});

test('repository rejects missing, inactive/ambiguous careers and unauthorized cycles', async () => {
  for (const options of [{ careers: [] }, { careers: [{ id: 'x', is_active: 0 }] },
    { careers: [{ id: 'x', is_active: 1 }, { id: 'y', is_active: 1 }] }, { cycles: [] }]) {
    const f = fakeDatabase(options);
    await assert.rejects(f.repository.createStudent(repositoryInput()), validationError);
    assert.equal(f.calls.at(-1), 'rollback');
    assert.ok(!f.calls.some((c) => typeof c === 'object' && c.sql.includes('INSERT')));
  }
});

test('repository preserves failures, rolls back profile failures and classifies confirmed duplicate email', async () => {
  const f = fakeDatabase({ failProfile: true });
  await assert.rejects(f.repository.createStudent(repositoryInput()), (e) => e === f.original);
  assert.equal(f.calls.at(-1), 'rollback');
  const duplicated = fakeDatabase({ duplicate: true });
  await assert.rejects(duplicated.repository.createStudent(repositoryInput()), (e) => e.code === 'EMAIL_ALREADY_REGISTERED' && e.status === 409);
  assert.ok(duplicated.calls.includes('rollback'));
});

test('explicit consent and exact server legal versions are mandatory', () => {
  for (const patch of [{ termsAccepted: false }, { termsAccepted: 'true' }, { termsVersion: '9.0.0' }, { privacyVersion: '' }]) {
    assert.throws(() => validateRegistration({ ...valid(), ...patch }), validationError);
  }
  for (const password of ['x'.repeat(8), 'x'.repeat(128), '🔐'.repeat(128)]) {
    assert.equal(validateRegistration({ ...valid(), password }).password, password);
  }
});

test('all fourteen catalog names and six prototype cycles match the nine-field contract without grouping fields', async () => {
  const { readAcademicCatalog } = await import('../database/academic-catalog.js');
  const catalog = await readAcademicCatalog();
  for (const career of catalog.careers) for (const cycle of catalog.cycles) {
    const output = validateRegistration({ ...valid(), career: career.name, cycle });
    assert.equal(output.career, career.name);
    assert.equal(output.cycle, cycle);
    assert.equal(Object.hasOwn(output, 'area'), false);
  }
});
