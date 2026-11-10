import { PublicError } from '../../errors/PublicError.js';

export function createAuthController(service, emailService) {
  return Object.freeze({
    async sendEmailCode(request, response) {
      if (!emailService) throw new PublicError('SERVICE_UNAVAILABLE');
      let result;
      try { result = await emailService.request(request.body); }
      catch (error) {
        if (error instanceof PublicError && error.code === 'RATE_LIMITED' && Number.isInteger(error.retryAfter) && error.retryAfter > 0 && error.retryAfter <= 3600) response.set('Retry-After', String(error.retryAfter));
        throw error;
      }
      response.set('Cache-Control', 'no-store').status(202).json(result);
    },
    async register(request, response) {
      const result = await service.register(request.body);
      response.set('Cache-Control', 'no-store').status(201).json(result);
    },
  });
}
