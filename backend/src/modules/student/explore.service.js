import { validateExploreQuery, validateMentorId, validateRecommendationsQuery } from './explore.validation.js';

export const recommendationWeights = Object.freeze({ skill: 45, level: 20, availability: 25, quality: 10 });

const unavailable = weight => ({ weight, available: false, score: null, contribution: 0,
  reason: 'DATA_NOT_MODELED' });

export function createExploreService(repository) {
  if (!repository || typeof repository.catalog !== 'function' || typeof repository.mentors !== 'function' ||
      typeof repository.mentor !== 'function' || typeof repository.recommendationInputs !== 'function') {
    throw new Error('Explore repository required');
  }
  return Object.freeze({
    catalog(query) { return repository.catalog(validateExploreQuery(query)); },
    mentors(userId, query) { return repository.mentors(userId, validateExploreQuery(query)); },
    mentor(userId, mentorId) { return repository.mentor(userId, validateMentorId(mentorId)); },
    async recommendations(userId, query) {
      const { limit } = validateRecommendationsQuery(query);
      const inputs = await repository.recommendationInputs(userId);
      if (!inputs.learning.length) return { rankingStatus: 'INSUFFICIENT_DATA', weights: recommendationWeights,
        missingSignals: ['level', 'availability', 'quality'], recommendations: [] };
      const requested = new Set(inputs.learning.map(skill => skill.id));
      const recommendations = inputs.mentors.map(mentor => {
        const matchedSkills = mentor.skills.filter(skill => requested.has(skill.id));
        const ratio = matchedSkills.length / requested.size;
        const skillContribution = Math.round(recommendationWeights.skill * ratio * 100) / 100;
        return { mentor, matchedSkills, score: skillContribution, evidenceCoverage: recommendationWeights.skill,
          components: { skill: { weight: recommendationWeights.skill, available: true, score: ratio,
            contribution: skillContribution }, level: unavailable(recommendationWeights.level),
          availability: unavailable(recommendationWeights.availability), quality: unavailable(recommendationWeights.quality) } };
      }).filter(item => item.matchedSkills.length > 0).sort((a, b) => b.score - a.score ||
        b.matchedSkills.length - a.matchedSkills.length || a.mentor.firstName.localeCompare(b.mentor.firstName, 'es') ||
        a.mentor.lastName.localeCompare(b.mentor.lastName, 'es') || a.mentor.id.localeCompare(b.mentor.id)).slice(0, limit);
      return { rankingStatus: recommendations.length ? 'PARTIAL' : 'INSUFFICIENT_DATA',
        weights: recommendationWeights, missingSignals: ['level', 'availability', 'quality'], recommendations };
    },
  });
}
