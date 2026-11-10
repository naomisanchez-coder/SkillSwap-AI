import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { createApp } from '../src/app.js';
import { validateEnv } from '../src/config/env.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const valid = {
  HOST: '127.0.0.1', PORT: '4000', DB_HOST: '127.0.0.1', DB_PORT: '3306',
  DB_USER: 'skillswap_app', DB_NAME: 'skillswap_ai', CORS_ORIGIN: 'http://localhost:5173',
};

async function withApp(check, run) {
  const server = createServer(createApp({ database: { check }, origins: [valid.CORS_ORIGIN] }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('importing app exits without opening a server', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    "await import('./src/app.js')"], { cwd: new URL('../', import.meta.url), timeout: 5000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
});

test('liveness and unknown route do not query the database', async () => {
  let calls = 0;
  await withApp(async () => { calls++; throw new Error('private detail'); }, async (base) => {
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.match(health.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await health.json(), { status: 'ok', service: 'skillswap-api' });
    const missing = await fetch(`${base}/missing`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { status: 'error', message: 'Not found' });
  });
  assert.equal(calls, 0);
});

test('database success invokes injected check (simulation)', async () => {
  let calls = 0;
  await withApp(async () => { calls++; }, async (base) => {
    const response = await fetch(`${base}/api/health/db`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' });
  });
  assert.equal(calls, 1);
});

test('database failure hides internal details (simulation)', async () => {
  await withApp(async () => { throw new Error('sensitive connection details'); }, async (base) => {
    const response = await fetch(`${base}/api/health/db`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'error', database: 'unavailable' });
  });
});

test('invalid JSON reaches centralized middleware', async () => {
  await withApp(async () => {}, async (base) => {
    const response = await fetch(`${base}/api/health`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: { code: 'INVALID_JSON', message: 'El JSON enviado no es válido.' } });
  });
});

test('unexpected errors return a generic 500', () => {
  const response = {
    status(code) { assert.equal(code, 500); return this; },
    json(body) { assert.deepEqual(body, { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Error interno del servidor.' } }); },
  };
  errorHandler(new Error('private details'), {}, response, () => assert.fail());
});

test('CORS permits only configured origins', async () => {
  await withApp(async () => {}, async (base) => {
    for (const origin of [valid.CORS_ORIGIN, 'https://untrusted.example']) {
      const response = await fetch(`${base}/api/health`, { headers: { Origin: origin } });
      assert.equal(response.headers.get('access-control-allow-origin'),
        origin === valid.CORS_ORIGIN ? origin : null);
    }
  });
});

test('configuration validates required fields and rejects unsafe values', () => {
  assert.equal(validateEnv(valid).port, 4000);
  for (const key of Object.keys(valid)) {
    assert.throws(() => validateEnv({ ...valid, [key]: '' }), /Invalid configuration/);
  }
  for (const patch of [ { PORT: '0' }, { PORT: '65536' }, { PORT: '4e3' },
    { DB_PORT: 'no' }, { DB_USER: 'root' }, { NODE_ENV: 'invalid' },
    { CORS_ORIGIN: '*' }, { CORS_ORIGIN: 'https://example.com/path' }, { DB_PASSWORD: 42 } ]) {
    assert.throws(() => validateEnv({ ...valid, ...patch }), /Invalid configuration/);
  }
});
