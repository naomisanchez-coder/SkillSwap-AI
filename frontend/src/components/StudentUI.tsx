import type { Mentor } from '../data/mentors';
import type { MentorCompatibility } from '../data/recommendations';
import { Badge, Button } from './ui';
import { Icons } from './icons';

export function StatCard({
  icon,
  label,
  value,
  tone = 'sage',
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: 'sage' | 'sand' | 'peach' | 'white';
}) {
  const tones = {
    sage: 'bg-[#DCEBDD]',
    sand: 'bg-[#F2E8D7]',
    peach: 'bg-[#F2D8C9]',
    white: 'bg-white',
  };
  return (
    <article className={`rounded-[18px] border border-[#E2E8E0] p-5 ${tones[tone]}`}>
      <div className="w-10 h-10 rounded-xl bg-white/80 text-[#24685F] flex items-center justify-center">{icon}</div>
      <p className="mt-4 text-2xl font-extrabold text-[#182B2A]">{value}</p>
      <p className="mt-1 text-sm text-[#60716C]">{label}</p>
    </article>
  );
}

export function EmptyState({
  icon = <Icons.Search s={28} />,
  title,
  description,
  action,
  onAction,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-[18px] border border-dashed border-[#CBD8CE] bg-white px-5 py-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#DCEBDD] text-[#24685F] mx-auto flex items-center justify-center">{icon}</div>
      <p className="mt-4 font-bold text-[#182B2A]">{title}</p>
      <p className="mt-2 max-w-md mx-auto text-sm leading-6 text-[#60716C]">{description}</p>
      {action && onAction && <Button className="mt-5" onClick={onAction}>{action}</Button>}
    </div>
  );
}

export function RecommendationReasons({ compatibility }: { compatibility: MentorCompatibility }) {
  return (
    <ul className="space-y-2">
      {compatibility.reasons.slice(0, 3).map(reason => (
        <li key={reason} className="flex items-start gap-2 text-sm leading-5 text-[#52645F]">
          <span className="mt-0.5 text-[#34877A]"><Icons.Check s={14} /></span>
          {reason}
        </li>
      ))}
    </ul>
  );
}

export function MentorCard({
  mentor,
  compatibility,
  rating,
  onView,
  showReasons = false,
}: {
  mentor: Mentor;
  compatibility?: MentorCompatibility;
  rating?: { average: number; count: number };
  onView: () => void;
  showReasons?: boolean;
}) {
  return (
    <article className="rounded-[20px] border border-[#E2E8E0] bg-white overflow-hidden shadow-sm flex flex-col">
      <div className="relative">
        <img src={mentor.image} alt={`Foto de ${mentor.name}`} loading="lazy" className="w-full h-48 object-cover object-top bg-[#DCEBDD]" />
      </div>
      <div className="p-5 flex flex-col flex-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[#182B2A]">{mentor.name}</h3>
            <p className="mt-1 text-sm text-[#60716C]">{mentor.skill} · {mentor.level}</p>
          </div>
          {compatibility && <Badge variant="primary">{compatibility.label}</Badge>}
        </div>
        <p className="mt-4 text-sm text-[#60716C] inline-flex items-start gap-2"><Icons.Clock s={15} /> {mentor.availability}</p>
        <p className="mt-2 text-sm text-[#60716C] inline-flex items-start gap-2"><Icons.Users s={15} /> Mentoría virtual</p>
        {rating?.count ? (
          <p className="mt-2 text-sm text-[#60716C] inline-flex items-center gap-2"><Icons.Star s={14} filled /> {rating.average.toFixed(1)} · {rating.count} valoraciones</p>
        ) : (
          <p className="mt-2 text-xs text-[#788983]">{mentor.serverManaged ? 'Sin valoraciones públicas disponibles.' : 'Mentor nuevo, todavía sin valoraciones.'}</p>
        )}
        {showReasons && compatibility && <div className="mt-4"><RecommendationReasons compatibility={compatibility} /></div>}
        <Button full className="mt-5" data-mentor-id={mentor.id} onClick={onView}>Ver perfil</Button>
      </div>
    </article>
  );
}
