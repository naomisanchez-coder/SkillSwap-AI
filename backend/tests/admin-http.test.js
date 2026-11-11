import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { PublicError } from '../src/errors/PublicError.js';

const token = 'a'.repeat(64), csrf = 'b'.repeat(64);
async function withApp(role, work) {
  const calls = [];
  const sessionService = { async authenticate() { return { user: { id: 'admin-id', role }, session: {} }; },
    async validateCsrf(_auth, _token, value) { if (value !== csrf) throw new PublicError('CSRF_INVALID'); } };
  const adminService = { async pending(query) { calls.push(['pending', query]); return []; },
    async document(id, type) { calls.push(['document', id, type]); return { buffer: Buffer.from('PDF'), mediaType: 'application/pdf' }; },
    async decide(id, applicationId, body) { calls.push(['decide', id, applicationId, body]); return { id: applicationId }; },
    async assignLevel(id, offerId, body) { calls.push(['level', id, offerId, body]); return { offerId }; } };
  const app = createApp({ database: { check: async () => {} }, origins: ['http://localhost:5173'],
    sessionService, adminService, cookie: { name: 'skillswap_session' } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try { await work(`http://127.0.0.1:${server.address().port}`, calls); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const headers = (extra = {}) => ({ Cookie: `skillswap_session=${token}`, Origin: 'http://localhost:5173', ...extra });

test('ADMIN routes reject anonymous and STUDENT sessions while private documents remain download-only', async () => {
  await withApp('admin', async base => {
    assert.equal((await fetch(`${base}/api/admin/mentor-applications`)).status, 401);
    const pending = await fetch(`${base}/api/admin/mentor-applications?limit=10`, { headers: headers() });
    assert.equal(pending.status, 200);
    assert.equal(pending.headers.get('cache-control'), 'no-store');
    const document = await fetch(`${base}/api/admin/mentor-applications/123e4567-e89b-12d3-a456-426614174000/documents/certificate`,
      { headers: headers() });
    assert.equal(document.status, 200);
    assert.equal(document.headers.get('content-type'), 'application/pdf');
    assert.equal(document.headers.get('content-security-policy'), 'sandbox');
  });
  await withApp('student', async base => assert.equal((await fetch(`${base}/api/admin/mentor-applications`,
    { headers: headers() })).status, 403));
});

test('ADMIN decisions and level assignments require approved origin, JSON and session CSRF', async () => {
  await withApp('admin', async (base, calls) => {
    const applicationId = '123e4567-e89b-12d3-a456-426614174000';
    const offerId = '223e4567-e89b-12d3-a456-426614174000';
    const decision = { decision: 'APPROVED', reason: 'Evidencia revisada.' };
    const request = (path, method, body, extra = {}) => fetch(`${base}${path}`, { method,
      headers: headers({ 'Content-Type': 'application/json', ...extra }), body: JSON.stringify(body) });
    assert.equal((await request(`/api/admin/mentor-applications/${applicationId}/decision`, 'POST', decision)).status, 403);
    assert.equal((await request(`/api/admin/mentor-applications/${applicationId}/decision`, 'POST', decision,
      { 'X-CSRF-Token': csrf, Origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await request(`/api/admin/mentor-applications/${applicationId}/decision`, 'POST', decision,
      { 'X-CSRF-Token': csrf })).status, 200);
    assert.equal((await request(`/api/admin/mentor-offers/${offerId}/level`, 'PUT', { levelCode: 'demo-advanced' },
      { 'X-CSRF-Token': csrf })).status, 200);
    assert.deepEqual(calls.filter(call => ['decide', 'level'].includes(call[0])), [
      ['decide', 'admin-id', applicationId, decision], ['level', 'admin-id', offerId, { levelCode: 'demo-advanced' }],
    ]);
  });
});
