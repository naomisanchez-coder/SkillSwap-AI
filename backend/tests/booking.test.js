import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookingService } from '../src/modules/student/booking.service.js';
import { limaSlot, sessionCosts, validateAvailability, validateMeeting } from '../src/modules/student/booking.validation.js';

const userId = '123e4567-e89b-42d3-a456-426614174000';
const offerId = '223e4567-e89b-42d3-a456-426614174000';
const requestId = '323e4567-e89b-42d3-a456-426614174000';
const sessionId = '423e4567-e89b-42d3-a456-426614174000';

function repository(overrides = {}) {
  return { async createBooking(id, value) { return { id, value }; }, async offers() { return []; },
    async setOffer() {}, async availability() {}, async replaceAvailability() {}, async publicAvailability() {},
    async sessions() { return []; }, async session() {}, async setMeeting() {}, async start() {},
    async performed() {}, async validate() {}, async review() {}, async credits() {}, ...overrides };
}

test('booking costs are derived exclusively from the approved durations', async () => {
  assert.deepEqual(sessionCosts, { 30: 5, 60: 10, 90: 15 });
  const service = createBookingService(repository(), { now: () => new Date('2027-01-01T00:00:00Z') });
  for (const [durationMinutes, creditCost] of [[30, 5], [60, 10], [90, 15]]) {
    const result = await service.createBooking(userId, { requestId, offerId,
      startsAt: '2027-01-05T15:00:00Z', durationMinutes });
    assert.equal(result.value.creditCost, creditCost);
    assert.equal(result.value.endsAt.getTime() - result.value.startsAt.getTime(), durationMinutes * 60000);
    assert.equal(result.value.slot.weekday, 2);
    assert.equal(result.value.slot.start, '10:00:00');
  }
  assert.throws(() => service.createBooking(userId, { requestId, offerId,
    startsAt: '2027-01-05T15:00:00Z', durationMinutes: 45 }), error => error.code === 'VALIDATION_ERROR');
});

test('structured availability rejects overlaps and booking intervals across Lima midnight', () => {
  assert.deepEqual(validateAvailability({ slots: [
    { weekday: 2, start: '14:00', end: '16:00' },
    { weekday: 1, start: '08:00', end: '09:00' },
  ] }), [
    { weekday: 1, start: '08:00', end: '09:00' },
    { weekday: 2, start: '14:00', end: '16:00' },
  ]);
  assert.throws(() => validateAvailability({ slots: [
    { weekday: 1, start: '08:00', end: '10:00' },
    { weekday: 1, start: '09:59', end: '11:00' },
  ] }), error => error.code === 'VALIDATION_ERROR');
  assert.throws(() => limaSlot(new Date('2027-01-02T04:30:00Z'), 60),
    error => error.code === 'VALIDATION_ERROR');
});

test('meeting links accept only approved HTTPS providers', () => {
  assert.equal(validateMeeting({ url: 'https://meet.google.com/abc-defg-hij' }),
    'https://meet.google.com/abc-defg-hij');
  assert.equal(validateMeeting({ url: 'https://tecsup.zoom.us/j/123' }), 'https://tecsup.zoom.us/j/123');
  for (const url of ['http://meet.google.com/a', 'https://example.com/meeting', 'https://user@zoom.us/j/1']) {
    assert.throws(() => validateMeeting({ url }), error => error.code === 'VALIDATION_ERROR');
  }
});

test('cancellation remains fail-closed until its economic policy is approved', () => {
  let called = false;
  const service = createBookingService(repository({ async cancel() { called = true; } }));
  assert.throws(() => service.cancel(userId, sessionId, {}),
    error => error.code === 'CANCELLATION_POLICY_PENDING' && error.status === 409);
  assert.equal(called, false);
});

test('review contract permits one bounded rating and delegates ownership to the repository', async () => {
  let received;
  const service = createBookingService(repository({ async review(id, session, value) {
    received = { id, session, value }; return value;
  } }));
  assert.deepEqual(await service.review(userId, sessionId, { rating: 5, comment: ' Excelente ' }),
    { rating: 5, comment: 'Excelente' });
  assert.deepEqual(received, { id: userId, session: sessionId, value: { rating: 5, comment: 'Excelente' } });
  assert.throws(() => service.review(userId, sessionId, { rating: 6 }), error => error.code === 'VALIDATION_ERROR');
});
