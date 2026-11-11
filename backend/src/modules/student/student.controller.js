export function createStudentController(service) {
  return Object.freeze({
    async profile(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ profile: await service.profile(request.auth.user.id) });
    },
    async updateProfile(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ profile: await service.updateProfile(request.auth.user.id, request.body) });
    },
    async onboarding(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ onboarding: await service.onboarding(request.auth.user.id) });
    },
    async completeOnboarding(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ onboarding: await service.completeOnboarding(request.auth.user.id, request.body) });
    },
    async catalog(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json(await service.catalog());
    },
    async credits(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({
        credits: await service.credits(request.auth.user.id, request.query),
      });
    },
    async dashboard(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({
        dashboard: await service.dashboard(request.auth.user.id, request.query),
      });
    },
  });
}
