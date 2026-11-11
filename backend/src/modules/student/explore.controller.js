export function createExploreController(service) {
  return Object.freeze({
    async catalog(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json(await service.catalog(request.query));
    },
    async mentors(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json(await service.mentors(request.auth.user.id, request.query));
    },
    async mentor(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ mentor: await service.mentor(
        request.auth.user.id, request.params.mentorId) });
    },
    async recommendations(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json(await service.recommendations(
        request.auth.user.id, request.query));
    },
  });
}
