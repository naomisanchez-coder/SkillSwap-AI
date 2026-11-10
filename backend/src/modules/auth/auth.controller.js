export function createAuthController(service) {
  return Object.freeze({
    async register(request, response) {
      const result = await service.register(request.body);
      response.set('Cache-Control', 'no-store').status(201).json(result);
    },
  });
}
