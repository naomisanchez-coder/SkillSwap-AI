import { validateCreditsQuery, validateDashboardQuery, validateOnboarding,
  validateProfilePatch } from './student.validation.js';

export function createStudentService(repository) {
  if (!repository || typeof repository.findOwn !== 'function' ||
      typeof repository.updateOwn !== 'function' || typeof repository.catalog !== 'function' ||
      typeof repository.creditsOwn !== 'function' || typeof repository.dashboardOwn !== 'function') {
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
      return Promise.all([repository.findOwn(userId), repository.creditsOwn(userId, { limit: 5, cursor: null }),
        repository.dashboardOwn(userId)])
        .then(([profile, credits, sessions]) => ({
          student: { firstName: profile.firstName, lastName: profile.lastName, career: profile.career,
            cycle: profile.cycle, onboardingComplete: profile.onboardingComplete },
          credits: { total: credits.total, held: credits.held, available: credits.available,
            movements: credits.transactions },
          sessions: { upcoming: sessions.upcoming, completed: sessions.completed },
          progress: sessions.progress,
          activity: { creditTransactions: credits.totalTransactions },
        }));
    },
  });
}
