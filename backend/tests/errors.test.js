import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { PublicError } from '../src/errors/PublicError.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

async function withErrors(run) {
  const app = express();
  app.use(express.json({ limit: '1kb' }));
  app.get('/validation', () => { throw new PublicError('VALIDATION_ERROR', { email: 'Usa el formato institucional.' }); });
  app.get('/internal', () => {
    throw Object.assign(new Error('private SQL and connection details'), {
      status: 422, code: 'VALIDATION_ERROR', fields: { password: 'private value' },
    });
  });
  app.post('/json', (req, res) => res.json({ status: 'ok' }));
  app.use(errorHandler);
  const server = createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve())); }
}

test('public validation errors return the HTTP contract and copied field messages', async () => {
  await withErrors(async (base) => {
    const response = await fetch(`${base}/validation`);
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: {
      code: 'VALIDATION_ERROR', message: 'Revisa los datos enviados.', fields: { email: 'Usa el formato institucional.' },
    } });
  });
  const fields = { email: 'Mensaje público.' };
  const error = new PublicError('VALIDATION_ERROR', fields);
  fields.email = 'Later mutation';
  assert.equal(error.fields.email, 'Mensaje público.');
  assert.throws(() => { error.code = 'INTERNAL'; }, TypeError);
});

test('unknown/driver errors cannot select public status, fields or message', async () => {
  await withErrors(async (base) => {
    const response = await fetch(`${base}/internal`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: {
      code: 'INTERNAL_SERVER_ERROR', message: 'Error interno del servidor.',
    } });
  });
});

test('malformed, oversized and unsupported JSON have stable public error codes', async () => {
  await withErrors(async (base) => {
    for (const [body, status, code] of [['{bad', 400, 'INVALID_JSON'],
      [JSON.stringify({ text: 'x'.repeat(1500) }), 413, 'PAYLOAD_TOO_LARGE']]) {
      const response = await fetch(`${base}/json`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      assert.equal(response.status, status);
      assert.equal((await response.json()).error.code, code);
    }
    const unsupported = await fetch(`${base}/json`, { method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=iso-8859-1' }, body: '{}' });
    assert.equal(unsupported.status, 415);
    assert.equal((await unsupported.json()).error.code, 'UNSUPPORTED_MEDIA_TYPE');
  });
});

test('unknown parser types and null errors stay generic; headers-sent errors are forwarded', () => {
  for (const error of [null, { type: '__proto__' }, { type: 'constructor' }]) {
    errorHandler(error, {}, {
      status(code) { assert.equal(code, 500); return this; },
      json(body) { assert.equal(body.error.code, 'INTERNAL_SERVER_ERROR'); },
    }, () => assert.fail());
  }
  const original = new Error('internal');
  errorHandler(original, {}, { headersSent: true }, (error) => assert.equal(error, original));
});

test('only curated codes and bounded public validation messages are accepted', () => {
  assert.throws(() => new PublicError('ARBITRARY_SQL_ERROR'), TypeError);
  for (const fields of [null, [], { password: 1 }, { email: '' }, { email: 'x'.repeat(201) },
    JSON.parse('{"__proto__":"not allowed"}')]) {
    assert.throws(() => new PublicError('VALIDATION_ERROR', fields), TypeError);
  }
  assert.throws(() => new PublicError('CONFLICT', { email: 'No' }), TypeError);
  for (const [code, status] of [['CONFLICT', 409], ['UNAUTHORIZED', 401], ['FORBIDDEN', 403],
    ['RATE_LIMITED', 429], ['SERVICE_UNAVAILABLE', 503]]) {
    const error = new PublicError(code);
    assert.equal(error.status, status);
    assert.equal(error.fields, undefined);
  }
});
