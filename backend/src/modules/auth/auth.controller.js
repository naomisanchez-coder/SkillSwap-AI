import { PublicError } from '../../errors/PublicError.js';

export function createAuthController(service, emailService) {
  return Object.freeze({
    async sendEmailCode(request, response) {
      if (!emailService) throw new PublicError('SERVICE_UNAVAILABLE');
      const result = await emailService.request(request.body);
      response.set('Cache-Control', 'no-store').status(202).json(result);
    },
    async register(request, response) {
      const result = await service.register(request.body);
      response.set('Cache-Control', 'no-store').status(201).json(result);
    },
  });
}
