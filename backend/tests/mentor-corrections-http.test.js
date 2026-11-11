import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createMentorService } from '../src/modules/student/mentor.service.js';
import { PublicError } from '../src/errors/PublicError.js';
const id = '123e4567-e89b-42d3-a456-426614174000';
const csrf = 'b'.repeat(64);
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
async function withApp(work) {
  const calls = []; let status = 'PENDING';
  const repository = {
    detailsAvailable: true,
    async createApplication(owner, value) { calls.push(['create', owner, value]); return { id, status: 'PENDING' }; },
    async updateApplication(owner, app, value) { calls.push(['update', owner, app, value]); return { id: app, status, ...value }; },
    async replaceCertificate(owner, app) { if (status === 'APPROVED') throw new PublicError('CONFLICT'); calls.push(['certificate', owner, app]); return { status, oldStorageKey: 'old-certificate' }; },
    async deletePhoto(owner) { calls.push(['delete-photo', owner]); return { deleted: true, oldStorageKey: 'old-photo' }; },
  };
  const storage = { async store() { calls.push(['store']); return 'a'.repeat(64); }, async read() {}, async remove(key) { calls.push(['remove', key]); } };
  const app = createApp({ database: {}, origins: ['http://localhost:5173'], studentService: { profile: async () => ({}) },
    sessionService: { async authenticate() { return { user: { id: 'owner', role: 'student' } }; }, async validateCsrf(_auth, _token, supplied) { if (supplied !== csrf) throw new PublicError('CSRF_INVALID'); } },
    mentorService: createMentorService(repository, storage) });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const request = (path, options = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/student${path}`, options);
  try { await work({ request, calls, approve() { status = 'APPROVED'; } }); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const headers = { Cookie: `skillswap_session=${'a'.repeat(64)}`, 'X-CSRF-Token': csrf, Origin: 'http://localhost:5173' };
test('PATCH y DELETE requieren sesión/CSRF; actualización usa propietario autenticado y rechaza privilegios inyectados', async () => withApp(async ({ request, calls }) => {
  assert.equal((await request(`/mentor-applications/${id}`, { method: 'PATCH', headers: { ...headers, 'X-CSRF-Token': '', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await request('/profile/photo', { method: 'DELETE' })).status, 401);
  assert.equal((await request('/profile/photo', { method: 'DELETE', headers: { ...headers, 'X-CSRF-Token': '' } })).status, 403);
  const details = { declaredLevel: 'Intermedio', experience: 'Experiencia', topics: 'Temas', portfolioUrl: null };
  assert.equal((await request(`/mentor-applications/${id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...details, approvedLevel: 'Avanzado' }) })).status, 422);
  assert.equal(calls.length, 0);
  const response = await request(`/mentor-applications/${id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(details) });
  assert.equal(response.status, 200); assert.equal((await response.json()).application.status, 'PENDING');
  assert.equal(calls[0][1], 'owner');
  assert.equal((await request('/profile/photo', { method: 'DELETE', headers })).status, 200);
  assert.deepEqual(calls.find(c => c[0] === 'delete-photo'), ['delete-photo', 'owner']);
}));
test('multipart conserva declaraciones y PDF; sustitución en APPROVED falla y compensa solo el archivo nuevo', async () => withApp(async ({ request, calls, approve }) => {
  const form = new FormData(); form.set('skillId', id); form.set('declaredLevel', 'Avanzado'); form.set('experience', 'Experiencia'); form.set('topics', 'Temas'); form.set('certificate', new Blob([pdf], { type: 'application/pdf' }), 'certificate.pdf');
  assert.equal((await request('/mentor-applications', { method: 'POST', headers, body: form })).status, 201);
  assert.equal(calls.find(c => c[0] === 'create')[2].details.declaredLevel, 'Avanzado');
  const replacement = () => { const value = new FormData(); value.set('certificate', new Blob([pdf], { type: 'application/pdf' }), 'new.pdf'); return value; };
  assert.equal((await request(`/mentor-applications/${id}/certificate`, { method: 'PUT', headers, body: replacement() })).status, 200);
  assert.ok(calls.some(c => c[0] === 'remove' && c[1] === 'old-certificate'));
  approve(); calls.length = 0;
  assert.equal((await request(`/mentor-applications/${id}/certificate`, { method: 'PUT', headers, body: replacement() })).status, 409);
  assert.deepEqual(calls, [['store'], ['remove', 'a'.repeat(64)]]);
}));
