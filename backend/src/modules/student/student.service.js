import { validateCreditsQuery, validateDashboardQuery, validateOnboarding,
  validateProfilePatch } from './student.validation.js';

export function createStudentService(repository) {
  if (!repository || typeof repository.findOwn !== 'function' ||
      typeof repository.updateOwn !== 'function' || typeof repository.catalog !== 'function' ||
      typeof repository.creditsOwn !== 'function') {
    throw new Error('Student repository required');
  }
  return Object.freeze({
    profile(userId) { return repository.findOwn(userId); },
    updateProfile(userId, body) { return repository.updateOwn(userId, validateProfilePatch(body)); },
    async onboarding(userId) {
      const profile = await repository.findOwn(userId);
      return { interests: profile.interests, level: profile.level, schedule: profile.schedule,
        complete: profile.onboardingComplete };
    },
    async completeOnboarding(userId, body) {
      const profile = await repository.updateOwn(userId, validateOnboarding(body));
      return { interests: profile.interests, level: profile.level, schedule: profile.schedule,
        complete: profile.onboardingComplete };
    },
    async catalog() { return { careers: await repository.catalog() }; },
    credits(userId, query) { return repository.creditsOwn(userId, validateCreditsQuery(query)); },
    dashboard(userId, query) {
      validateDashboardQuery(query);
      return Promise.all([repository.findOwn(userId), repository.creditsOwn(userId, { limit: 1, cursor: null })])
        .then(([profile, credits]) => ({
          student: { firstName: profile.firstName, lastName: profile.lastName, career: profile.career,
            cycle: profile.cycle, onboardingComplete: profile.onboardingComplete },
          credits: { balance: credits.balance },
          activity: { creditTransactions: credits.totalTransactions },
        }));
    },
  });
}
