import type { Mentor } from './mentors';
import { canonicalSkill, isEligibleMentor } from './recommendations';

export type DiscoveryFilters = { query: string; category: string; skill: string; level: string; day: string };
export const emptyDiscoveryFilters = (): DiscoveryFilters => ({ query: '', category: 'Todas', skill: 'Todas', level: 'Todos', day: 'Todos' });

// Nombres del PublicContent original; el mapa antiguo usaba etiquetas de otra versión.
const categorySkills: Record<string, string[]> = {
  Programación: ['python', 'java', 'react'],
  'Bases de datos': ['sql'],
  Matemáticas: ['matematicas'],
  'Electrónica y automatización': ['electronica', 'automatizacion'],
  Redes: ['redes'],
  'Excel y herramientas digitales': ['excel', 'power bi'],
  Inglés: ['ingles'],
  'Comunicación y técnicas de estudio': ['presentaciones', 'investigacion'],
};
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function filterMentors(mentors: Mentor[], filters: DiscoveryFilters, currentUserId: string): Mentor[] {
  const query = normalize(filters.query);
  return mentors.filter(mentor => {
    if (!isEligibleMentor(mentor, currentUserId)) return false;
    const queryMatch = !query || [mentor.skill, mentor.name, mentor.bio].some(value => normalize(value).includes(query));
    const categoryMatch = filters.category === 'Todas' || (categorySkills[filters.category] ?? []).map(canonicalSkill).includes(canonicalSkill(mentor.skill));
    const skillMatch = filters.skill === 'Todas' || canonicalSkill(mentor.skill) === canonicalSkill(filters.skill);
    const levelMatch = filters.level === 'Todos' || mentor.level === filters.level;
    const dayMatch = filters.day === 'Todos' || Boolean(mentor.slots[filters.day]?.length);
    return queryMatch && categoryMatch && skillMatch && levelMatch && dayMatch;
  });
}
