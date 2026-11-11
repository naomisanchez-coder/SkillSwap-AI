import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { PublicError } from '../src/errors/PublicError.js';

const token = 'a'.repeat(64), csrf = 'b'.repeat(64);
const userId = '123e4567-e89b-42d3-a456-426614174000';
const mentorId = '223e4567-e89b-42d3-a456-426614174000';
const requestId = '323e4567-e89b-42d3-a456-426614174000';
const offerId = '423e4567-e89b-42d3-a456-426614174000';

async function withApp({ booking = true } = {}, work) {
  const calls = [];
  const sessionService = {
    async authenticate() { return { user: { id: userId, role: 'student' }, session: {}, inspected: {} }; },
    async validateCsrf(auth, value, supplied) { if (supplied !== csrf) throw new PublicError('CSRF_INVALID'); },
  };
  const studentService = { async profile() { return { id: userId }; } };
  const bookingService = booking ? {
    async publicAvailability(id) { calls.push(['availability', id]); return { timezone: 'America/Lima', slots: [], busy: [] }; },
    async createBooking(id, body) { calls.push(['book', id, body]); return { id: 'session-id', creditCost: 5 }; },
    async sessions(id, query) { calls.push(['sessions', id, query]); return []; },
    async cancel() { throw new PublicError('CANCELLATION_POLICY_PENDING'); },
    async credits(id) { calls.push(['credits', id]); return { total: 20, held: 5, available: 15 }; },
  } : undefined;
  const app = createApp({ database: { check: async () => {} }, origins: ['http://localhost:5173'],
    sessionService, studentService, bookingService, cookie: { name: 'skillswap_session' } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await work(`http://127.0.0.1:${server.address().port}`, calls); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('booking reads are session-owned and do not require CSRF', async () => {
  await withApp({}, async (base, calls) => {
    const headers = { Cookie: `skillswap_session=${token}` };
    assert.equal((await fetch(`${base}/api/student/explore/mentors/${mentorId}/availability`, { headers })).status, 200);
    assert.equal((await fetch(`${base}/api/student/sessions`, { headers })).status, 200);
    const credits = await fetch(`${base}/api/student/session-credits`, { headers });
    assert.equal(credits.status, 200);
    assert.deepEqual((await credits.json()).credits, { total: 20, held: 5, available: 15 });
    assert.ok(calls.some(call => call[0] === 'availability' && call[1] === mentorId));
  });
});

test('booking mutations require JSON, approved origin and session-bound CSRF', async () => {
  await withApp({}, async (base, calls) => {
    const body = JSON.stringify({ requestId, offerId, startsAt: '2027-01-05T15:00:00Z', durationMinutes: 30 });
    const request = headers => fetch(`${base}/api/student/bookings`, { method: 'POST', headers: {
      Cookie: `skillswap_session=${token}`, 'Content-Type': 'application/json', ...headers }, body });
    assert.equal((await request({ Origin: 'http://localhost:5173' })).status, 403);
    assert.equal((await request({ Origin: 'https://evil.invalid', 'X-CSRF-Token': csrf })).status, 403);
    const response = await request({ Origin: 'http://localhost:5173', 'X-CSRF-Token': csrf });
    assert.equal(response.status, 201);
    assert.ok(calls.some(call => call[0] === 'book' && call[1] === userId));
  });
});

test('cancellation is publicly identified as pending and unavailable modules fail closed', async () => {
  await withApp({}, async base => {
    const response = await fetch(`${base}/api/student/sessions/${mentorId}/cancel`, { method: 'POST', headers: {
      Cookie: `skillswap_session=${token}`, 'Content-Type': 'application/json', Origin: 'http://localhost:5173',
      'X-CSRF-Token': csrf }, body: '{}' });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'CANCELLATION_POLICY_PENDING');
  });
  await withApp({ booking: false }, async base => {
    const response = await fetch(`${base}/api/student/sessions`, { headers: { Cookie: `skillswap_session=${token}` } });
    assert.equal(response.status, 503);
  });
});
