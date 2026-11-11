import type { Mentor } from './mentors';
import type { UserProfile } from './student';
import { preferenceIntervals, intervalsOverlap, parseTime } from './scheduling';
import { SKILL_CATALOG } from './skillCatalog';

export const RECOMMENDATION_WEIGHTS = {
  skill: 45,
  level: 20,
  availability: 25,
  quality: 10,
} as const;

export type RecommendationPreferences = {
  skill: string;
  level: string;
  availability: string;
  goals?: string;
};

export type CompatibilityFactor = {
  key: keyof typeof RECOMMENDATION_WEIGHTS;
  label: string;
  points: number;
  maximum: number;
  detail: string;
  matched: boolean;
};

export type MentorCompatibility = {
  total: number;
  label: 'Muy compatible' | 'Compatible' | 'Coincidencia parcial';
  factors: CompatibilityFactor[];
  reasons: string[];
  matchingSlots: string[];
};

export type MentorRecommendation = {
  mentor: Mentor;
  compatibility: MentorCompatibility;
};

const normalize = (value = '') =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const skillAliases: Record<string, string[]> = {
  python: ['python', 'programacion en python'],
  excel: ['excel', 'hojas de calculo', 'ofimatica'],
  sql: ['sql', 'bases de datos'],
  figma: ['figma', 'ux/ui', 'ux', 'ui', 'diseno ux', 'diseno digital'],
  react: ['react', 'reactjs', 'desarrollo web'],
  java: ['java'],
  marketing: ['marketing', 'marketing digital'],
  ingles: ['ingles', 'conversacion en ingles'],
  presentaciones: ['presentaciones', 'comunicacion', 'exposiciones'],
  investigacion: ['investigacion', 'metodologia de investigacion'],
};

export function canonicalSkill(value: string): string {
  const normalized = normalize(value);
  const entry = Object.entries(skillAliases).find(([canonical, aliases]) =>
    canonical === normalized || aliases.some(alias => normalized === alias || normalized.includes(alias)),
  );
  return entry?.[0] ?? normalized;
}

export function skillsMatch(requested: string, offered: string): boolean {
  if (!requested.trim() || !offered.trim()) return false;
  return canonicalSkill(requested) === canonicalSkill(offered);
}

const levelRank: Record<string, number> = {
  principiante: 1,
  'estoy empezando': 1,
  intermedio: 2,
  'tengo conocimientos basicos': 2,
  avanzado: 3,
  'quiero profundizar': 3,
};

function skillFactor(mentor: Mentor, preferences: RecommendationPreferences): CompatibilityFactor {
  const matched = skillsMatch(preferences.skill, mentor.skill);
  return {
    key: 'skill',
    label: 'Habilidad',
    points: matched ? RECOMMENDATION_WEIGHTS.skill : 0,
    maximum: RECOMMENDATION_WEIGHTS.skill,
    matched,
    detail: matched ? 'Enseña la habilidad que buscas.' : 'No enseña la habilidad seleccionada.',
  };
}

function levelFactor(mentor: Mentor, preferences: RecommendationPreferences): CompatibilityFactor {
  const learnerRank = levelRank[normalize(preferences.level)];
  const mentorRank = levelRank[normalize(mentor.level)];
  if (!learnerRank || !mentorRank) {
    return {
      key: 'level',
      label: 'Nivel',
      points: 0,
      maximum: RECOMMENDATION_WEIGHTS.level,
      matched: false,
      detail: 'Falta información de nivel para comparar.',
    };
  }
  const difference = mentorRank - learnerRank;
  const points = difference >= 0
    ? RECOMMENDATION_WEIGHTS.level
    : difference === -1
      ? Math.round(RECOMMENDATION_WEIGHTS.level * 0.5)
      : 0;
  return {
    key: 'level',
    label: 'Nivel',
    points,
    maximum: RECOMMENDATION_WEIGHTS.level,
    matched: points > 0,
    detail: points === RECOMMENDATION_WEIGHTS.level
      ? 'Su nivel de enseñanza es adecuado para ti.'
      : points > 0
        ? 'Su nivel es cercano a tu punto de partida.'
        : 'El nivel declarado no se ajusta a tu punto de partida.',
  };
}

function availabilityFactor(mentor: Mentor, preferences: RecommendationPreferences): CompatibilityFactor & { slots: string[] } {
  const intervals = preferenceIntervals(preferences.availability);
  if (!intervals.length) {
    return { key: 'availability', label: 'Horarios', points: 0, maximum: RECOMMENDATION_WEIGHTS.availability, matched: false, detail: 'Agrega tu disponibilidad para comparar horarios.', slots: [] };
  }
  const matchingSlots: string[] = [];
  let matchingDay = false;
  Object.entries(mentor.slots).forEach(([day, slots]) => {
    const dayIntervals = intervals.filter(interval => normalize(interval.day) === normalize(day));
    if (!dayIntervals.length) return;
    matchingDay = true;
    slots.forEach(slot => {
      const start = parseTime(slot);
      // El catálogo original representa bloques de una hora. [inicio, fin).
      if (dayIntervals.some(interval => intervalsOverlap(interval.start, interval.end, start, start + 60))) {
        matchingSlots.push(`${day} · ${slot}`);
      }
    });
  });
  const points = matchingSlots.length
    ? RECOMMENDATION_WEIGHTS.availability
    : matchingDay
      ? Math.round(RECOMMENDATION_WEIGHTS.availability * 0.6)
      : 0;
  return {
    key: 'availability',
    label: 'Horarios',
    points,
    maximum: RECOMMENDATION_WEIGHTS.availability,
    matched: points > 0,
    detail: matchingSlots.length
      ? `Publica horarios compatibles en America/Lima: ${matchingSlots.slice(0, 2).join(' y ')}. La disponibilidad final se verifica al reservar.`
      : matchingDay
        ? 'Coincide contigo en el día; revisa los horarios disponibles.'
        : 'No encontramos coincidencias con tu disponibilidad.',
    slots: matchingSlots,
  };
}

function qualityFactor(rating?: { average: number; count: number }): CompatibilityFactor {
  const hasRatings = Boolean(rating?.count);
  const points = hasRatings
    ? Math.round((Math.min(5, Math.max(0, rating?.average ?? 0)) / 5) * RECOMMENDATION_WEIGHTS.quality)
    : Math.ceil(RECOMMENDATION_WEIGHTS.quality / 2);
  return {
    key: 'quality',
    label: 'Perfil',
    points,
    maximum: RECOMMENDATION_WEIGHTS.quality,
    matched: true,
    detail: hasRatings
      ? `Cuenta con ${rating?.count} valoraciones de la comunidad.`
      : 'Es un mentor nuevo; se aplica una valoración neutral.',
  };
}

export function preferencesFromProfile(profile: UserProfile, skill?: string): RecommendationPreferences {
  return {
    skill: skill || profile.interests[0] || '',
    level: profile.level,
    availability: profile.availability,
    goals: profile.goals,
  };
}

export function estimateMentorCompatibility(
  mentor: Mentor,
  profileOrPreferences: UserProfile | RecommendationPreferences,
  communityRating?: number,
  ratingCount = 0,
): MentorCompatibility {
  const preferences = 'interests' in profileOrPreferences
    ? preferencesFromProfile(profileOrPreferences)
    : profileOrPreferences;
  const availability = availabilityFactor(mentor, preferences);
  const factors: CompatibilityFactor[] = [
    skillFactor(mentor, preferences),
    levelFactor(mentor, preferences),
    availability,
    qualityFactor(communityRating === undefined ? undefined : { average: communityRating, count: ratingCount }),
  ];
  const total = factors.reduce((sum, factor) => sum + factor.points, 0);
  const label = total >= 80 ? 'Muy compatible' : total >= 60 ? 'Compatible' : 'Coincidencia parcial';
  return {
    total,
    label,
    factors,
    reasons: factors.filter(factor => factor.matched).map(factor => factor.detail).slice(0, 3),
    matchingSlots: availability.slots,
  };
}

export function isEligibleMentor(mentor: Mentor, currentUserId?: string): boolean {
  const hasSlots = Object.values(mentor.slots).some(slots => slots.length > 0);
  const isOwnOffer = currentUserId ? mentor.ownerUserId === currentUserId || mentor.id === `student-mentor-${currentUserId}` : false;
  const catalogSkill = SKILL_CATALOG.find(skill => skill.id === mentor.offer.skillId);
  return Boolean(
    mentor.skillValidated
    && (mentor.serverManaged || catalogSkill?.active)
    && mentor.active !== false
    && mentor.name.trim()
    && mentor.skill.trim()
    && hasSlots
    && !isOwnOffer,
  );
}

export function recommendMentors({
  mentors,
  preferences,
  ratings,
  currentUserId,
}: {
  mentors: Mentor[];
  preferences: RecommendationPreferences;
  ratings: Record<string, { average: number; count: number }>;
  currentUserId?: string;
}): MentorRecommendation[] {
  if (!preferences.skill.trim()) return [];
  return mentors
    .filter(mentor => isEligibleMentor(mentor, currentUserId))
    .filter(mentor => skillsMatch(preferences.skill, mentor.skill))
    .map(mentor => ({
      mentor,
      compatibility: estimateMentorCompatibility(
        mentor,
        preferences,
        ratings[mentor.id]?.average,
        ratings[mentor.id]?.count,
      ),
    }))
    .sort((a, b) =>
      b.compatibility.total - a.compatibility.total
      || a.mentor.id.localeCompare(b.mentor.id),
    )
    .slice(0, 3);
}

export function findCatalogSkill(input: string, skills: string[]): string | null {
  const normalized = canonicalSkill(input);
  return skills.find(skill => canonicalSkill(skill) === normalized) ?? null;
}
