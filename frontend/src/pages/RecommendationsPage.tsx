import { skillLabel } from '../data/skillLabels';
import { IntegrationContext } from '../services/integrationContext';
import type { MentorRecommendation } from '../data/recommendations';
import { useContext, useEffect, useMemo, useState, useRef } from 'react';
import { Button, Input } from '../components/ui';
import { EmptyState, MentorCard } from '../components/StudentUI';
import { Icons } from '../components/icons';
import type { Mentor } from '../data/mentors';
import type { UserProfile } from '../data/student';
import {
  isEligibleMentor,
  preferencesFromProfile,
  recommendMentors,
} from '../data/recommendations';
import { RecommendationAssistant } from '../components/RecommendationAssistant';
import { publicSkillCategories } from '../data/publicContent';
import { emptyDiscoveryFilters, filterMentors, type DiscoveryFilters } from '../data/discovery';
import { hasCompletePreferences } from '../data/student';

export default function RecommendationsPage({
  mentors,
  profile,
  ratings,
  recommended = true,
  onViewMentor,
  onEditPreferences,
  filters,
  onFiltersChange,
}: {
  mentors: Mentor[];
  profile: UserProfile;
  ratings: Record<string, { average: number; count: number }>;
  recommended?: boolean;
  onViewMentor: (id: string) => void;
  onEditPreferences: () => void;
  filters: DiscoveryFilters;
  onFiltersChange: (filters: DiscoveryFilters) => void;
}) {
  const integration = useContext(IntegrationContext);
  const [remoteRecommendations, setRemoteRecommendations] = useState<MentorRecommendation[]>([]);
  const [recommendationError, setRecommendationError] = useState('');
  useEffect(() => {
    if (!integration) return;
    let active = true;
    integration.recommendations().then(items => { if (active) { setRemoteRecommendations(items); setRecommendationError(''); } }, error => { if (active) setRecommendationError(error instanceof Error ? error.message : 'No se pudieron cargar las recomendaciones.'); });
    return () => { active = false; };
  }, [integration, profile]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [recommended]);
  const { query, category, skill, level, day } = filters;
  const setQuery = (query: string) => onFiltersChange({ ...filters, query });
  const setCategory = (category: string) => onFiltersChange({ ...filters, category });
  const setSkill = (skill: string) => onFiltersChange({ ...filters, skill });
  const setLevel = (level: string) => onFiltersChange({ ...filters, level });
  const setDay = (day: string) => onFiltersChange({ ...filters, day });
  const eligible = useMemo(
    () => mentors.filter(mentor => isEligibleMentor(mentor, profile.id)),
    [mentors, profile.id],
  );
  const skills = useMemo(() => Array.from(new Set(eligible.map(mentor => mentor.skill))), [eligible]);
  const categories = integration ? Array.from(new Set(eligible.map(mentor => mentor.category).filter(Boolean))).map(name => ({ name: name!, tone: publicSkillCategories[0].tone })) : publicSkillCategories;
  const levels = integration ? Array.from(new Set(eligible.map(mentor => mentor.level))) : ['Principiante', 'Intermedio', 'Avanzado'];
  const days = useMemo(() => Array.from(new Set(eligible.flatMap(mentor => Object.keys(mentor.slots)))), [eligible]);

  const exploreResults = useMemo(() => filterMentors(eligible, filters, profile.id), [eligible, filters, profile.id]);
  const preferencesIncomplete = !hasCompletePreferences(profile);

  const recommendations = useMemo(
    () => preferencesIncomplete ? [] : recommendMentors({
      mentors: eligible,
      preferences: preferencesFromProfile(profile),
      ratings,
      currentUserId: profile.id,
    }),
    [eligible, profile, ratings, preferencesIncomplete],
  );
  const results = recommended ? (integration ? remoteRecommendations : recommendations) : exploreResults.map(mentor => ({ mentor, compatibility: undefined }));
  const clearFilters = () => onFiltersChange(emptyDiscoveryFilters());

  return (
    <main className="max-w-[1240px] mx-auto px-4 md:px-8 py-8 md:py-12 text-[#182B2A]">
      {recommendationError && <p role="alert">{recommendationError}</p>}
      <section className={`rounded-[24px] border p-7 md:p-9 ${recommended ? 'bg-[#DCEBDD] border-[#C9D8CC]' : 'bg-[#F2E8D7] border-[#E8DAC2]'}`}>
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#24685F]">{recommended ? 'Recomendación personalizada' : 'Catálogo de la comunidad'}</p>
        <h1 ref={heading} tabIndex={-1} className="mt-3 text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">{recommended ? 'Mentores que encajan contigo' : 'Explora habilidades y encuentra a tu mentor'}</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[#52645F]">{recommended ? 'Estas sugerencias consideran lo que quieres aprender, tu nivel y tus horarios.' : 'Busca libremente por habilidad, nombre o tema relacionado.'}</p>
      </section>

      {recommended ? (
        <section className="mt-6 rounded-[20px] border border-[#E2E8E0] bg-white p-5 md:p-6 flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex-1 grid sm:grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
            {[
              ['Quiero aprender', skillLabel(profile.interests[0] || 'Sin definir')],
              ['Nivel actual', profile.level || 'Sin definir'],
              ['Disponibilidad', profile.availability || 'Sin definir'],
              ['Modalidad', 'Virtual'],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-semibold text-[#788983]">{label}</p>
                <p className="mt-1 font-bold text-[#182B2A]">{value}</p>
              </div>
            ))}
          </div>
          <Button variant="outline" onClick={onEditPreferences}>Editar mis preferencias</Button>
        </section>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="text-lg font-bold">Áreas para explorar</h2>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              <button type="button" aria-pressed={category === 'Todas'} onClick={() => setCategory('Todas')} className={`flex-shrink-0 min-h-11 rounded-full px-4 text-sm font-bold border ${category === 'Todas' ? 'bg-[#24685F] text-white border-[#24685F]' : 'bg-white text-[#52645F] border-[#CBD8CE]'}`}>Todas</button>
              {categories.map(item => (
                <button type="button" key={item.name} aria-pressed={category === item.name} onClick={() => setCategory(item.name)} className={`flex-shrink-0 min-h-11 rounded-full px-4 text-sm font-bold border ${category === item.name ? 'bg-[#24685F] text-white border-[#24685F]' : `${item.tone} text-[#334A46] border-[#CBD8CE]`}`}>{item.name}</button>
              ))}
            </div>
          </section>
          <section className="mt-5 rounded-[20px] border border-[#E2E8E0] bg-white p-5">
            <div className="grid md:grid-cols-2 xl:grid-cols-[1.4fr_repeat(3,1fr)] gap-3">
              <Input label="Buscar mentores" value={query} onChange={setQuery} placeholder="Habilidad, mentor o tema" icon={<Icons.Search s={15} />} />
              <FilterSelect label="Habilidad" value={skill} onChange={setSkill} options={['Todas', ...skills]} />
              <FilterSelect label="Nivel" value={level} onChange={setLevel} options={['Todos', ...levels]} />
              <FilterSelect label="Disponibilidad" value={day} onChange={setDay} options={['Todos', ...days]} />
            </div>
          </section>
        </>
      )}

      <section className="mt-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">{recommended ? 'Tus mejores coincidencias' : `${results.length} ${results.length === 1 ? 'mentor disponible' : 'mentores disponibles'}`}</h2>
            <p role="status" className="mt-1 text-sm text-[#60716C]">{recommended ? `${results.length} ${results.length === 1 ? 'mentor seleccionado' : 'mentores seleccionados'} según tus intereses y disponibilidad.` : 'Solo se muestran habilidades aprobadas con horarios activos.'}</p>
          </div>
          {!recommended && <Button variant="ghost" onClick={clearFilters}>Limpiar filtros</Button>}
        </div>
        {results.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title={recommended ? preferencesIncomplete ? 'Completa tus preferencias para recibir recomendaciones' : 'Todavía no hay una coincidencia para tus preferencias' : 'No hay mentores para estos filtros'}
              description={recommended ? 'Puedes editar la habilidad que deseas aprender o explorar el catálogo general.' : 'Esta categoría puede crecer más adelante. Prueba otra habilidad o limpia los filtros.'}
              action={recommended ? 'Editar mis preferencias' : 'Limpiar filtros'}
              onAction={recommended ? onEditPreferences : clearFilters}
            />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5 mt-5">
            {results.map(({ mentor, compatibility }) => (
              <MentorCard
                key={mentor.id}
                mentor={mentor}
                compatibility={compatibility}
                rating={ratings[mentor.id]}
                showReasons={recommended}
                onView={() => onViewMentor(mentor.id)}
              />
            ))}
          </div>
        )}
      </section>
      <RecommendationAssistant mentors={eligible} profile={profile} ratings={ratings} onViewMentor={onViewMentor} />
    </main>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="text-xs font-semibold text-[#60716C]">
      <span className="sr-only">{label}</span>
      <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} className="w-full h-11 rounded-xl border border-[#E2E8E0] bg-white px-3 text-sm text-[#334A46] focus:outline-none focus:ring-2 focus:ring-[#DCEBDD] focus:border-[#34877A]">
        {options.map(option => <option key={option} value={option}>{skillLabel(option)}</option>)}
      </select>
    </label>
  );
}
