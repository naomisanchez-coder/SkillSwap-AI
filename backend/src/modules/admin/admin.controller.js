export function createAdminController(service) {
  const binary = (response, value) => response.set({ 'Cache-Control': 'no-store',
    'Content-Type': value.mediaType, 'Content-Length': String(value.buffer.length),
    'Content-Disposition': 'attachment', 'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin', 'Content-Security-Policy': 'sandbox' }).status(200).send(value.buffer);
  return Object.freeze({
    async pending(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ applications: await service.pending(request.query) });
    },
    async document(request, response) {
      return binary(response, await service.document(request.params.applicationId, request.params.type));
    },
    async decide(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ application: await service.decide(
        request.auth.user.id, request.params.applicationId, request.body) });
    },
    async assignLevel(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ assignment: await service.assignLevel(
        request.auth.user.id, request.params.offerId, request.body) });
    },
  });
}
