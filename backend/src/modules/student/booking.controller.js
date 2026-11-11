export function createBookingController(service) {
  return Object.freeze({
    async offers(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ offers: await service.offers(request.auth.user.id) });
    },
    async setOffer(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ offer: await service.setOffer(
        request.auth.user.id, request.params.skillId, request.body) });
    },
    async availability(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ availability: await service.availability(request.auth.user.id) });
    },
    async replaceAvailability(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ availability: await service.replaceAvailability(
        request.auth.user.id, request.body) });
    },
    async publicAvailability(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ availability: await service.publicAvailability(
        request.params.mentorId) });
    },
    async book(request, response) {
      response.set('Cache-Control', 'no-store').status(201).json({ session: await service.createBooking(
        request.auth.user.id, request.body) });
    },
    async sessions(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ sessions: await service.sessions(
        request.auth.user.id, request.query) });
    },
    async session(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ session: await service.session(
        request.auth.user.id, request.params.sessionId) });
    },
    async setMeeting(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ session: await service.setMeeting(
        request.auth.user.id, request.params.sessionId, request.body) });
    },
    async start(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ session: await service.start(
        request.auth.user.id, request.params.sessionId, request.body) });
    },
    async performed(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ session: await service.performed(
        request.auth.user.id, request.params.sessionId, request.body) });
    },
    async validate(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ session: await service.validate(
        request.auth.user.id, request.params.sessionId, request.body) });
    },
    async cancel(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ session: await service.cancel(
        request.auth.user.id, request.params.sessionId, request.body) });
    },
    async review(request, response) {
      response.set('Cache-Control', 'no-store').status(201).json({ review: await service.review(
        request.auth.user.id, request.params.sessionId, request.body) });
    },
    async credits(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ credits: await service.credits(request.auth.user.id) });
    },
  });
}
