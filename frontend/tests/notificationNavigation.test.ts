import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notificationDestination } from '../src/data/notificationNavigation';
import { bookingReceiptMessage } from '../src/data/bookingReceipt';
import type { BookingLedger, ConfirmedBooking } from '../src/data/booking';
import type { MentorSkillRequest } from '../src/data/account';
import type { NotificationRecord } from '../src/data/student';

const session = { id: 'SES-one', studentId: 'alex', mentorId: 'carlos', status: 'completed', performedAt: '2030-01-01T10:00:00Z', validatedAt: '2030-01-01T11:00:00Z' } as ConfirmedBooking;
const ledger = { sessions: [session], incidents: [{ id: 'INC-one', sessionId: session.id }] } as BookingLedger;
const request = { id: 'REQ-one', ownerUserId: 'alex', submissionId: 'new', status: 'rejected', history: [{ id: 'SUB-old' }, { id: 'DEC-one' }] } as MentorSkillRequest;
const notification = (patch: Partial<NotificationRecord> = {}): NotificationRecord => ({ id: 'NOT-unknown', userId: 'alex', title: 'Aviso', description: '', date: 'Ahora', read: false, target: 'sessions', ...patch });

test('comprobante: diferencia doble confirmación, resolución administrativa y registro incompleto', () => {
  assert.match(bookingReceiptMessage(session), /Ambos participantes confirmaron/);
  const admin = { ...session, performedAt: undefined, validatedAt: undefined, adminResolution: { incidentId: 'INC-one', at: '2030-01-01T12:00:00Z', adminId: 'admin' } };
  assert.match(bookingReceiptMessage(admin), /por decisión administrativa.*INC-one/);
  assert.doesNotMatch(bookingReceiptMessage(admin), /Ambos participantes/);
  assert.match(bookingReceiptMessage({ ...admin, performedAt: session.performedAt }), /por decisión administrativa/);
  assert.match(bookingReceiptMessage({ ...session, validatedAt: undefined }), /No hay constancia/);
  assert.match(bookingReceiptMessage({ ...session, status: 'cancelled' }), /devolvieron/);
  assert.match(bookingReceiptMessage({ ...session, status: 'review' }), /retenidos/);
});

test('notificación: selecciona sesión por ID y estado actual, incluyendo avisos antiguos', () => {
  for (const status of ['upcoming', 'active', 'validation', 'completed', 'cancelled', 'review'] as const) {
    const current = { ...ledger, sessions: [{ ...session, status }] };
    for (const item of [notification({ sessionId: session.id }), notification({ id: 'NOT-SES-one-booked-student' }), notification({ id: 'NOT-INC-one-resolved-student' })]) assert.deepEqual(notificationDestination(item, 'alex', current, [], false), { type: 'session', id: session.id, role: 'student', status });
  }
});

test('notificación: mentor solo puede abrir sus sesiones con acceso habilitado', () => {
  const item = notification({ userId: 'mentor-carlos', sessionId: session.id, target: 'mentor-sessions' });
  assert.deepEqual(notificationDestination(item, 'mentor-carlos', ledger, [], true), { type: 'session', id: session.id, role: 'mentor', status: 'completed' });
  assert.deepEqual(notificationDestination(item, 'mentor-carlos', ledger, [], false), { type: 'unavailable' });
  assert.deepEqual(notificationDestination({ ...item, userId: 'alex' }, 'alex', ledger, [], true), { type: 'unavailable' });
});

test('notificación: solicitudes nuevas y antiguas conservan relación tras revisión y reenvío', () => {
  for (const item of [notification({ target: 'skills', requestId: request.id }), notification({ target: 'skills', id: 'NOT-old-skill' }), notification({ target: 'skills', id: 'NOT-DEC-one-review' })]) assert.deepEqual(notificationDestination(item, 'alex', ledger, [request], true), { type: 'request', id: request.id });
  assert.deepEqual(notificationDestination(notification({ target: 'skills', requestId: request.id }), 'alex', ledger, [{ ...request, ownerUserId: 'foreign' }], true), { type: 'unavailable' });
});

test('notificación: referencias ausentes, ambiguas o ajenas no abren otra entidad', () => {
  for (const item of [notification({ sessionId: 'missing' }), notification({ sessionId: session.id, userId: 'foreign' }), notification({ target: 'skills', requestId: 'missing' }), notification({ target: 'https://evil.test' })]) assert.deepEqual(notificationDestination(item, 'alex', ledger, [request], true), { type: 'unavailable' });
  const ambiguous = { ...ledger, sessions: [session, { ...session, id: 'SES' }] };
  assert.deepEqual(notificationDestination(notification({ id: 'NOT-SES-one-booked-student' }), 'alex', ambiguous, [], false), { type: 'unavailable' });
  assert.deepEqual(notificationDestination(notification({ id: 'NOT-SES-one-booked-student', sessionId: session.id }), 'alex', ambiguous, [], false), { type: 'session', id: session.id, role: 'student', status: 'completed' });
  assert.deepEqual(notificationDestination(notification({ target: 'wallet' }), 'alex', ledger, [], false), { type: 'page', page: 'wallet' });
});