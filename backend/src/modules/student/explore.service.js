import { validateExploreQuery, validateMentorId, validateRecommendationsQuery } from './explore.validation.js';

export const recommendationWeights = Object.freeze({ skill: 45, level: 20, availability: 25, quality: 10 });

const insufficient = weight => ({ weight, available: false, score: null, contribution: 0,
  reason: 'INSUFFICIENT_DATA' });
const minute = 60000, day = 24 * 60 * minute, limaOffset = 5 * 60 * minute;

function rounded(value, digits = 4) { return Math.round(value * (10 ** digits)) / (10 ** digits); }
function time(value) {
  const matched = String(value).match(/^(\d{2}):(\d{2})/);
  return matched ? Number(matched[1]) * 60 + Number(matched[2]) : null;
}
function instant(value) {
  if (value instanceof Date) return value.getTime();
  const text = String(value);
  return new Date(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`).getTime();
}
function availabilityComponent(signal) {
  if (!signal?.slots?.length || !Number.isFinite(instant(signal.now))) return insufficient(recommendationWeights.availability);
  const now = instant(signal.now), localNow = now - limaOffset, local = new Date(localNow);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const weekday = local.getUTCDay() || 7;
  let configuredMinutes = 0, bookableMinutes = 0;
  for (const slot of signal.slots) {
    const startMinute = time(slot.start), endMinute = time(slot.end);
    if (!Number.isInteger(slot.weekday) || startMinute === null || endMinute === null || startMinute >= endMinute) continue;
    let localStart = today + ((slot.weekday - weekday + 7) % 7) * day + startMinute * minute;
    let localEnd = today + ((slot.weekday - weekday + 7) % 7) * day + endMinute * minute;
    if (localEnd <= localNow) { localStart += 7 * day; localEnd += 7 * day; }
    const start = Math.max(localStart + limaOffset, now), end = localEnd + limaOffset;
    if (end <= start) continue;
    configuredMinutes += (end - start) / minute;
    const overlaps = (signal.busy ?? []).map(item => [Math.max(start, instant(item.starts_at ?? item.startsAt)),
      Math.min(end, instant(item.ends_at ?? item.endsAt))]).filter(([from, to]) => Number.isFinite(from) && to > from)
      .sort((a, b) => a[0] - b[0]);
    let cursor = start;
    for (const [from, to] of overlaps) {
      if (from > cursor && from - cursor >= 30 * minute) bookableMinutes += (from - cursor) / minute;
      cursor = Math.max(cursor, to);
    }
    if (end - cursor >= 30 * minute) bookableMinutes += (end - cursor) / minute;
  }
  if (!configuredMinutes) return insufficient(recommendationWeights.availability);
  const score = rounded(bookableMinutes / configuredMinutes);
  return { weight: recommendationWeights.availability, available: true, score,
    contribution: rounded(recommendationWeights.availability * score, 2),
    evidence: { configuredMinutes, bookableMinutes, horizon: 'NEXT_WEEKLY_OCCURRENCE' } };
}
function qualityComponent(value) {
  const reviewed = Number(value?.reviewed_sessions ?? 0), completed = Number(value?.completed_sessions ?? 0);
  const average = Number(value?.average_rating);
  if (!reviewed || !Number.isFinite(average)) return insufficient(recommendationWeights.quality);
  const score = rounded(average / 5);
  return { weight: recommendationWeights.quality, available: true, score,
    contribution: rounded(recommendationWeights.quality * score, 2),
    evidence: { completedSessions: completed, reviewedSessions: reviewed, averageRating: rounded(average, 2) } };
}
function levelComponent(skills) {
  if (!skills.length || skills.some(skill => !skill.level || !Number.isFinite(Number(skill.level.rank)))) {
    return insufficient(recommendationWeights.level);
  }
  const levels = skills.map(skill => ({ skillId: skill.id, code: skill.level.code,
    name: skill.level.name, rank: Number(skill.level.rank) }));
  const score = rounded(levels.reduce((total, item) => total + item.rank, 0) / levels.length / 100);
  return { weight: recommendationWeights.level, available: true, score,
    contribution: rounded(recommendationWeights.level * score, 2), evidence: { levels } };
}

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
      const recommendations = inputs.mentors.map(source => {
        const { availability, quality, ...mentor } = source;
        const matchedSkills = mentor.skills.filter(skill => requested.has(skill.id));
        const ratio = matchedSkills.length / requested.size;
        const skillContribution = Math.round(recommendationWeights.skill * ratio * 100) / 100;
        const levelValue = levelComponent(matchedSkills);
        const availabilityValue = availabilityComponent(availability);
        const qualityValue = qualityComponent(quality);
        const evidenceCoverage = recommendationWeights.skill + (levelValue.available ? recommendationWeights.level : 0) +
          (availabilityValue.available ? recommendationWeights.availability : 0) +
          (qualityValue.available ? recommendationWeights.quality : 0);
        return { mentor, matchedSkills, score: rounded(skillContribution + levelValue.contribution + availabilityValue.contribution +
          qualityValue.contribution, 2), evidenceCoverage,
          components: { skill: { weight: recommendationWeights.skill, available: true, score: ratio,
            contribution: skillContribution }, level: levelValue,
          availability: availabilityValue, quality: qualityValue } };
      }).filter(item => item.matchedSkills.length > 0).sort((a, b) => b.score - a.score ||
        b.matchedSkills.length - a.matchedSkills.length || a.mentor.firstName.localeCompare(b.mentor.firstName, 'es') ||
        a.mentor.lastName.localeCompare(b.mentor.lastName, 'es') || a.mentor.id.localeCompare(b.mentor.id)).slice(0, limit);
      const missingSignals = ['level', 'availability', 'quality'].filter(name =>
        recommendations.some(item => !item.components[name].available));
      return { rankingStatus: recommendations.length ? (missingSignals.length ? 'PARTIAL' : 'COMPLETE') : 'INSUFFICIENT_DATA',
        weights: recommendationWeights, missingSignals, recommendations };
    },
  });
}
