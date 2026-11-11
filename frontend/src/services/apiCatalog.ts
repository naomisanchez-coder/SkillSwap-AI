import { api } from './http';
import type { CatalogService } from './catalog';
import type { Mentor } from '../data/mentors';
import type { MentorRecommendation } from '../data/recommendations';
import { formatTime } from '../data/scheduling';

type OfferedSkill = { category: string | null; id: string; name: string; offerId: string; costByDuration: Record<30 | 60 | 90, number>; level: { name: string } | null };
export type ApiMentor = { id: string; firstName: string; lastName: string; bio: string | null; skills: OfferedSkill[] };
export type Availability = { timezone: string; slots: { weekday: number; start: string; end: string }[]; busy: { startsAt: string; endsAt: string }[] };
const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export function mentorView(source: ApiMentor, availability: Availability): Mentor {
  const skill = source.skills[0];
  if (!skill?.offerId || !skill.costByDuration) throw new Error('La API no entregó una oferta reservable.');
  const slots: Record<string, string[]> = {};
  for (const slot of availability.slots) {
    const start = Number(slot.start.slice(0, 2)) * 60 + Number(slot.start.slice(3, 5));
    const end = Number(slot.end.slice(0, 2)) * 60 + Number(slot.end.slice(3, 5));
    const day = days[slot.weekday % 7];
    slots[day] ??= [];
    for (let minute = start; minute < end; minute += 30) slots[day].push(formatTime(minute));
  }
  const label = Object.keys(slots).join(', ') || 'Sin disponibilidad publicada';
  return { serverManaged: true, category: skill.category ?? '', availabilityWindows: availability.slots, id: source.id, ownerUserId: source.id, requestId: skill.offerId, name: `${source.firstName} ${source.lastName}`, skill: skill.name,
    level: skill.level?.name ?? 'Sin nivel publicado', rating: null, sessions: null, availability: label, modalities: ['Virtual'], skillValidated: true,
    image: '', bio: source.bio ?? '', slots, topics: source.skills.map(s => s.name), active: true,
    offer: { skillId: skill.id, topic: skill.name, level: skill.level?.name ?? '', description: source.bio ?? '', durations: [30, 60, 90], availability: label, costByDuration: skill.costByDuration } };
}
export const readAvailability = async (id: string) => (await api<{ availability: Availability }>(`/student/explore/mentors/${encodeURIComponent(id)}/availability`)).availability;
export const readMentor = async (id: string) => mentorView((await api<{ mentor: ApiMentor }>(`/student/explore/mentors/${encodeURIComponent(id)}`)).mentor, await readAvailability(id));
export const apiCatalogService: CatalogService = {
  async getMentors() {
    const all: ApiMentor[] = []; let cursor: string | null = null;
    do {
      const page: { mentors: ApiMentor[]; pagination: { nextCursor: string | null } } = await api(`/student/explore/mentors?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      all.push(...page.mentors); cursor = page.pagination.nextCursor;
    } while (cursor);
    return Promise.all(all.map(async source => mentorView(source, await readAvailability(source.id))));
  },
};
// El backend requiere sesión para Explorar; la portada anónima no usa fixtures.
export const anonymousCatalogService: CatalogService = { async getMentors() { return []; } };
export async function readRecommendations(): Promise<MentorRecommendation[]> {
  const result = await api<{ rankingStatus: string; recommendations: { mentor: ApiMentor; score: number; evidenceCoverage: number }[] }>('/student/recommendations?limit=20');
  return Promise.all(result.recommendations.map(async item => ({ mentor: mentorView(item.mentor, await readAvailability(item.mentor.id)),
    compatibility: { total: item.score, label: result.rankingStatus === 'PARTIAL' || item.evidenceCoverage < 100 ? 'Coincidencia parcial' as const : item.score >= 70 ? 'Muy compatible' as const : 'Compatible' as const,
      reasons: [`Puntuación del servidor: ${item.score}/100`, `Cobertura de evidencia: ${item.evidenceCoverage}%. ${item.evidenceCoverage < 100 ? 'Faltan señales; recomendación parcial.' : ''}`], factors: [], matchingSlots: [] } })));
}
