import { randomUUID } from 'node:crypto';
import { PublicError } from '../../errors/PublicError.js';
import { identifier, limaSlot, validateAvailability, validateBooking, validateEmpty, validateMeeting,
  validateOffer, validateReview, validateSessionsQuery } from './booking.validation.js';

export function createBookingService(repository, { now = () => new Date() } = {}) {
  if (!repository || typeof repository.createBooking !== 'function') throw new Error('Booking repository required');
  return Object.freeze({
    offers(userId) { return repository.offers(userId); },
    setOffer(userId, skillId, body) {
      return repository.setOffer(userId, identifier(skillId, 'skillId'), validateOffer(body), randomUUID());
    },
    availability(userId) { return repository.availability(userId); },
    replaceAvailability(userId, body) { return repository.replaceAvailability(userId, validateAvailability(body)); },
    publicAvailability(mentorId) { return repository.publicAvailability(identifier(mentorId, 'mentorId')); },
    createBooking(userId, body) {
      const input = validateBooking(body);
      if (input.startsAt <= now()) throw new PublicError('VALIDATION_ERROR', { startsAt: 'Selecciona una fecha futura.' });
      const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60000);
      return repository.createBooking(userId, { ...input, endsAt,
        slot: limaSlot(input.startsAt, input.durationMinutes), sessionId: randomUUID(),
        holdTransactionId: randomUUID(), eventId: randomUUID() });
    },
    sessions(userId, query) { return repository.sessions(userId, validateSessionsQuery(query)); },
    session(userId, sessionId) { return repository.session(userId, identifier(sessionId, 'sessionId')); },
    setMeeting(userId, sessionId, body) {
      return repository.setMeeting(userId, identifier(sessionId, 'sessionId'), validateMeeting(body));
    },
    start(userId, sessionId, body) {
      validateEmpty(body); return repository.start(userId, identifier(sessionId, 'sessionId'), randomUUID());
    },
    performed(userId, sessionId, body) {
      validateEmpty(body); return repository.performed(userId, identifier(sessionId, 'sessionId'), randomUUID());
    },
    validate(userId, sessionId, body) {
      validateEmpty(body); return repository.validate(userId, identifier(sessionId, 'sessionId'), {
        earningTransactionId: randomUUID(), eventId: randomUUID() });
    },
    cancel(userId, sessionId, body) {
      validateEmpty(body); return repository.cancel(userId, identifier(sessionId, 'sessionId'), {
        refundTransactionId: randomUUID(), eventId: randomUUID(),
      });
    },
    review(userId, sessionId, body) {
      return repository.review(userId, identifier(sessionId, 'sessionId'), validateReview(body), randomUUID());
    },
    credits(userId) { return repository.credits(userId); },
  });
}
