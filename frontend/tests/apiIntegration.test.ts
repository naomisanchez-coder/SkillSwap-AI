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

test('foto: DELETE con cookie y CSRF limpia el avatar sin PATCH ni cambios al perfil', async () => {
  let hasPhoto = true;
  await mockFetch(async calls => {
    const { account } = createProfileServices(identity);
    assert.ok((await account.getAccount()).profile.photoStorageId);
    const changed = await account.deletePhoto!();
    assert.equal(changed.profile.photoStorageId, undefined);
    assert.equal(changed.profile.name, identity.user.name);
    const mutations = calls.filter(c => c.options.method !== 'GET');
    assert.equal(mutations.length, 1); assert.equal(mutations[0].options.method, 'DELETE');
    assert.equal((mutations[0].options.headers as Record<string, string>)['X-CSRF-Token'], identity.csrfToken);
  }, (url, options) => {
    if (options.method === 'DELETE') { hasPhoto = false; return { photo: { deleted: true } }; }
    return url.endsWith('/profile') ? { profile: { ...profile, hasPhoto } } : { applications: [] };
  });
});

test('solicitud: envía y recupera declaraciones reales junto al PDF; no utiliza nivel de aprendizaje como aprobación', async () => {
  let applications: unknown[] = [];
  const details = { level: 'Avanzado' as const, experience: 'Experiencia real de prueba', topics: 'Temas de prueba' };
  await mockFetch(async calls => {
    const { account } = createProfileServices(identity);
    const result = await account.submitApplication({ id: 'new', submissionId: 'submission', skill: skill.name, ...details, portfolio: '', evidenceFile: new File(['%PDF-fixture'], 'evidence.pdf', { type: 'application/pdf' }) });
    const call = calls.find(c => c.options.method === 'POST')!;
    const data = call.body as FormData;
    assert.equal(data.get('declaredLevel'), 'Avanzado'); assert.equal(data.get('experience'), details.experience); assert.equal(data.get('topics'), details.topics);
    assert.ok(data.get('certificate') instanceof Blob); assert.equal(data.has('approvedLevel'), false);
    assert.equal(result.requests[0].level, 'Avanzado'); assert.equal(result.requests[0].experience, details.experience); assert.equal(result.requests[0].status, 'pending');
  }, (url, options) => {
    if (url.endsWith('/mentor-application/requirements')) return { requirements: { applicationDetails: { available: true } } };
    if (url.endsWith('/skills/catalog')) return { skills: [skill] };
    if (url.endsWith('/profile')) return { profile };
    if (options.method === 'POST') { applications = [{ id: 'created', skill: skill.name, declaredLevel: details.level, experience: details.experience, topics: details.topics, status: 'PENDING', certificateAttached: true, submittedAt: session.startsAt }]; return { application: applications[0] }; }
    return { applications };
  });
});

test('solicitud pendiente: actualiza datos y sustituye PDF sin reenviar como REJECTED ni eliminar certificado', async () => {
  await mockFetch(async calls => {
    const { account } = createProfileServices(identity);
    await account.submitApplication({ id: 'existing', submissionId: 'existing', skill: skill.name, level: 'Intermedio', experience: 'Experiencia', topics: 'Temas', portfolio: '', evidenceFile: new File(['%PDF-new'], 'new.pdf', { type: 'application/pdf' }) });
    const writes = calls.filter(c => c.options.method !== 'GET');
    assert.deepEqual(writes.map(c => c.options.method), ['PATCH', 'PUT']);
    assert.ok(writes[1].url.endsWith('/existing/certificate'));
    assert.deepEqual(writes[0].body, { declaredLevel: 'Intermedio', experience: 'Experiencia', topics: 'Temas', portfolioUrl: null });
  }, url => url.endsWith('/mentor-application/requirements') ? { requirements: { applicationDetails: { available: true } } } : url.endsWith('/skills/catalog') ? { skills: [skill] } : url.endsWith('/profile') ? { profile } : { applications: [{ id: 'existing', skill: skill.name, status: 'PENDING', certificateAttached: true }] });
});

test('solicitud sin migración: bloquea antes de subir archivos o descartar textos', async () => {
  await mockFetch(async calls => {
    const { account } = createProfileServices(identity);
    await assert.rejects(account.submitApplication({ id: 'new', submissionId: 'new', skill: skill.name, level: 'Avanzado', experience: 'Experiencia', topics: 'Temas', portfolio: '' }), /todavía no está habilitado/);
    assert.ok(calls.every(c => c.options.method === 'GET'));
  }, () => ({ requirements: { applicationDetails: { available: false } } }));
});

test('Gemini 503: informa indisponibilidad sin mostrar códigos internos ni repetir la solicitud', async () => {
  await mockFetch(async calls => {
    await assert.rejects(createChatService(identity.csrfToken)('Consulta', []), error => error instanceof ApiError && error.code === 'AI_UNAVAILABLE' && /temporalmente indisponible/.test(error.message) && !/AI_UNAVAILABLE/.test(error.message));
    assert.equal(calls.length, 1);
  }, () => Response.json({ error: { code: 'AI_UNAVAILABLE', message: 'El asistente de IA no está disponible temporalmente.' } }, { status: 503 }));
});

test('etiquetas naturales y validación de solicitud conservan el nombre canónico y aceptan catálogo real', async () => {
  const { skillLabel } = await import('../src/data/skillLabels');
  const { normalizeApplication } = await import('../src/data/account');
  assert.equal(skillLabel(skill.name), 'Programación en Python');
  const value = normalizeApplication({ skill: skill.name, level: 'Intermedio', experience: 'Experiencia', topics: 'Temas', portfolio: '' }, [skill.name]);
  assert.equal(value.skill, skill.name);
  assert.throws(() => normalizeApplication({ ...value, level: '' }, [skill.name]));
  assert.throws(() => normalizeApplication({ ...value, experience: '' }, [skill.name]));
});

test('certificado: sustitución independiente usa solo PUT y funciona sin habilitar campos nuevos', async () => {
  await mockFetch(async calls => {
    const { account } = createProfileServices(identity);
    await account.replaceCertificate!('existing', new File(['%PDF-new'], 'new.pdf', { type: 'application/pdf' }));
    const writes = calls.filter(c => c.options.method !== 'GET');
    assert.equal(writes.length, 1); assert.equal(writes[0].options.method, 'PUT');
    assert.ok(writes[0].url.endsWith('/existing/certificate'));
    assert.deepEqual(Array.from((writes[0].body as FormData).keys()), ['certificate']);
    assert.equal((writes[0].options.headers as Record<string, string>)['X-CSRF-Token'], identity.csrfToken);
    assert.ok(!calls.some(c => c.url.includes('/requirements') || c.url.includes('/resubmit')));
  }, url => url.endsWith('/profile') ? { profile } : { applications: [] });
});
