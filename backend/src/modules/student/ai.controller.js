export function createAiController(service) {
  return Object.freeze({
    async chat(request, response) {
      const result = await service.chat(request.auth.user.id, request.body);
      response.set('Cache-Control', 'no-store').status(200).json({
        message: { role: 'assistant', content: result.reply },
        grounding: result.grounding, rateLimit: result.rateLimit,
      });
    },
  });
}
