import { createChatService } from '../src/services/ai';
import { passwordRecoveryService, resetPassword } from '../src/services/passwordRecovery';
import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/services/http';
import { createStudentServices, sessionView } from '../src/services/apiStudent';
import { createProfileServices } from '../src/services/apiProfile';
import { mentorView, readRecommendations } from '../src/services/apiCatalog';
import { isEligibleMentor } from '../src/data/recommendations';
import { isBookingSlotAvailable } from '../src/data/booking';
import { canCancelSession } from '../src/data/sessionLifecycle';
import { validateProfileStep } from '../src/data/profileOptions';
import type { AuthSession } from '../src/services/auth';

const identity: AuthSession = { csrfToken: 'a'.repeat(64), user: { id: 'student', firstName: 'Ana', lastName: 'Prueba', name: 'Ana Prueba', email: 'ana.prueba@tecsup.edu.pe', institution: 'TECSUP', career: 'Software', cycle: 1, role: 'student', emailVerified: true, onboardingComplete: false } };
const skill = { id: 'skill-uuid', category: 'Catálogo de demostración', name: 'Programación en Python (demostración)', offerId: 'offer-uuid', costByDuration: { 30: 5, 60: 10, 90: 15 }, level: { name: 'Avanzado (demostración)' } };
const source = { id: 'mentor-uuid', firstName: 'Mentor', lastName: 'Demo', bio: null, skills: [skill] };
const availability = { timezone: 'America/Lima', slots: [{ weekday: 1, start: '17:00', end: '18:00' }], busy: [] };
const profile = { ...identity.user, hasPhoto: false, bio: null, interests: [], level: null, goals: null, schedule: null };
const session = { id: 'session-uuid', student: { id: 'student', firstName: 'Ana', lastName: 'Prueba' }, mentor: { id: source.id, firstName: 'Mentor', lastName: 'Demo' }, skill: { name: skill.name }, status: 'UPCOMING', startsAt: '2026-11-16T22:00:00.000Z', durationMinutes: 30 as const, creditCost: 5, meetingUrl: null, review: null };
async function mockFetch(run: (calls: { url: string; options: RequestInit; body: unknown }[]) => Promise<void>, respond: (url: string, options: RequestInit) => unknown) {
  const old = globalThis.fetch; const calls: { url: string; options: RequestInit; body: unknown }[] = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options, body: typeof options.body === 'string' ? JSON.parse(options.body) : options.body });
    const value = respond(String(url), options);
    return value instanceof Response ? value : Response.json(value);
  };
  try { await run(calls); } finally { globalThis.fetch = old; }
}

test('HTTP: cookies, CSRF, multipart sin Content-Type manual y errores públicos sin reintentar', async () => {
  await mockFetch(async calls => {
    const data = new FormData(); data.set('photo', new Blob(['image']), 'photo.png');
    await api('/student/profile/photo', { method: 'PUT', body: data, csrf: identity.csrfToken });
    assert.equal(calls[0].options.credentials, 'include');
    assert.equal((calls[0].options.headers as Record<string, string>)['X-CSRF-Token'], identity.csrfToken);
    assert.equal((calls[0].options.headers as Record<string, string>)['Content-Type'], undefined);
    await assert.rejects(api('/failure', { method: 'POST', body: {} }), error => error instanceof ApiError && error.code === 'VALIDATION_ERROR' && error.fields?.career === 'Selecciona una carrera vigente.');
    assert.equal(calls.length, 2);
  }, url => url.endsWith('/failure') ? Response.json({ error: { code: 'VALIDATION_ERROR', message: 'Revisa los datos.', fields: { career: 'Selecciona una carrera vigente.' } } }, { status: 422 }) : { photo: { available: true } });
});

test('catálogo demo: conserva UUID y tarifa; no filtra por fixtures ni extiende el final de disponibilidad', () => {
  const mentor = mentorView(source, availability);
  assert.equal(mentor.requestId, skill.offerId);
  assert.equal(isEligibleMentor(mentor, identity.user.id), true);
  assert.equal(mentor.offer.costByDuration[60], 10);
  const context = { mentor, studentId: identity.user.id, userName: identity.user.name, wallet: { available: 20, held: 0, used: 0, earned: 0 }, sessions: [], reservedSlots: [], serverManaged: true };
  assert.equal(isBookingSlotAvailable(context, '2026-11-16', '5:30 PM', 30), true);
  assert.equal(isBookingSlotAvailable(context, '2026-11-16', '5:30 PM', 60), false);
  assert.equal(validateProfileStep({ interests: [skill.name], level: '', availability: '', goals: '', modality: 'Virtual' }, 1, [skill.name]), null);
});

test('sesiones: UTC a Lima, costo y estado del servidor; cancelación antes del inicio sin regla ficticia de 12h', () => {
  const value = sessionView(session);
  assert.equal(value.date, '2026-11-16'); assert.equal(value.time, '5:00 PM'); assert.equal(value.credits, 5);
  assert.equal(canCancelSession(value, new Date('2026-11-16T21:59:00Z')), true);
  assert.equal(canCancelSession(value, new Date(session.startsAt)), false);
  assert.throws(() => sessionView({ ...session, status: 'UNKNOWN' }));
});

test('reservar: contrato exacto, idempotencia estable y recarga de saldos reales; borrar borrador no cancela', async () => {
  await mockFetch(async calls => {
    const { student } = createStudentServices(identity);
    const command = { id: 'SES-123e4567-e89b-42d3-a456-426614174000', mentorId: source.id, date: '2026-11-16', time: '5:00 PM', duration: 30 as const };
    const result = await student.confirmBooking(command);
    const post = calls.find(call => call.url.endsWith('/bookings'))!;
    assert.deepEqual(post.body, { requestId: '123e4567-e89b-42d3-a456-426614174000', offerId: skill.offerId, startsAt: session.startsAt, durationMinutes: 30 });
    assert.equal((post.options.headers as Record<string, string>)['X-CSRF-Token'], identity.csrfToken);
    assert.equal(result.wallet.available, 15); assert.equal(result.wallet.held, 5); assert.equal(result.wallet.total, 20);
    assert.equal(result.ledger.movements[0].type, 'initial_grant');
    await student.clearBookingDraft();
    assert.equal(calls.filter(call => call.options.method === 'POST').length, 1);
    await assert.rejects(student.updateSession({ type: 'report', sessionId: session.id, category: 'other', reason: 'Prueba' }));
    assert.equal(calls.filter(call => call.options.method === 'POST').length, 1);
  }, url => {
    if (url.includes('/availability')) return { availability };
    if (url.includes('/explore/mentors/')) return { mentor: source };
    if (url.endsWith('/bookings')) return { session };
    if (url.includes('/sessions?')) return { sessions: [session] };
    if (url.includes('/credits?')) return { credits: { total: 20, available: 15, held: 5, used: 0, earned: 0, transactions: [{ id: 'grant', amount: 20, reason: 'INITIAL_EMAIL_VERIFICATION', reference: 'initial-email-verification:student', occurredAt: session.startsAt, holdStatus: null }], pagination: { nextCursor: null } } };
    throw new Error(`Unexpected mocked request: ${url}`);
  });
});

test('onboarding: nombres demo reales, guarda goals aparte y conserva intención TEACH al sincronizar LEARN', async () => {
  await mockFetch(async calls => {
    const { preferences } = createProfileServices(identity);
    const value = await preferences.savePreferences({ interests: [skill.name], level: 'Intermedio', availability: 'Lunes · 5:00 PM – 6:00 PM', goals: 'Desarrollar un proyecto', modality: 'Virtual' });
    assert.equal(value.interests[0], skill.name);
    const onboarding = calls.find(c => c.url.endsWith('/onboarding'))!;
    assert.deepEqual(onboarding.body, { interests: [skill.name], level: 'Intermedio', schedule: 'Lunes · 5:00 PM – 6:00 PM' });
    assert.deepEqual(calls.find(c => c.url.endsWith(`/skills/${skill.id}`))!.body, { learning: true, teaching: true });
  }, url => url.endsWith('/skills/catalog') ? { skills: [skill] } : url.endsWith('/skills') ? { skills: [{ ...skill, learning: false, teaching: true }] } : { profile: { ...profile, interests: [skill.name] } });
});

test('ranking: conserva puntuación y cobertura PARTIAL sin renormalizar ni inventar valoraciones', async () => {
  await mockFetch(async () => {
    const results = await readRecommendations();
    assert.equal(results[0].compatibility.total, 71.25);
    assert.equal(results[0].compatibility.label, 'Coincidencia parcial');
    assert.match(results[0].compatibility.reasons.join(' '), /90%/);
  }, url => url.includes('/availability') ? { availability } : { rankingStatus: 'PARTIAL', recommendations: [{ mentor: source, score: 71.25, evidenceCoverage: 90 }] });
});


test('chatbot: ninguna llamada al crear el servicio, contrato con CSRF y cuota sin reintentos automáticos', async () => {
  await mockFetch(async calls => {
    const chat = createChatService(identity.csrfToken);
    assert.equal(calls.length, 0);
    assert.equal(await chat('Quiero aprender Python', []), 'Orientación académica');
    assert.deepEqual(calls[0].body, { message: 'Quiero aprender Python', history: [] });
    assert.equal((calls[0].options.headers as Record<string, string>)['X-CSRF-Token'], identity.csrfToken);
    await assert.rejects(chat('limited', []), error => error instanceof ApiError && error.code === 'AI_PROVIDER_LIMITED');
    assert.equal(calls.length, 2);
  }, (_url, options) => JSON.parse(options.body as string).message === 'limited' ? Response.json({ error: { code: 'AI_PROVIDER_LIMITED', message: 'Cuota temporal' } }, { status: 503 }) : { reply: 'Orientación académica' });
});

test('recuperación: conserva recoveryId y envía código y contraseña solamente al reset público protegido', async () => {
  await mockFetch(async calls => {
    const result = await passwordRecoveryService.submit(identity.user.email, new AbortController().signal);
    assert.equal(result.status, 'accepted');
    if (result.status !== 'accepted') throw new Error('Expected accepted');
    await resetPassword(result.email, result.recoveryId, '123456', 'Contraseña nueva de prueba', new AbortController().signal);
    assert.deepEqual(calls[1].body, { email: identity.user.email, recoveryId: 'recovery-id', code: '123456', newPassword: 'Contraseña nueva de prueba' });
    assert.equal((calls[1].options.headers as Record<string, string>)['X-CSRF-Protection'], '1');
    assert.equal(calls.length, 2);
  }, url => url.endsWith('/request') ? { status: 'accepted', recoveryId: 'recovery-id' } : { status: 'password_updated' });
});
