// Primitivas reutilizadas del archivo ui.tsx original de Figma Make.
export { Button } from './Button';

type Status = 'online' | 'offline' | 'busy' | 'away';

const dotColor: Record<Status, string> = {
  online: '#10B981', offline: '#94A3B8', busy: '#EF4444', away: '#F59E0B',
};
const avatarSizes: Record<string, { wh: string; dot: string; text: string }> = {
  sm: { wh: 'w-7 h-7', dot: 'w-2 h-2 border', text: 'text-[10px]' },
  md: { wh: 'w-9 h-9', dot: 'w-2.5 h-2.5 border-2', text: 'text-sm' },
  lg: { wh: 'w-12 h-12', dot: 'w-3 h-3 border-2', text: 'text-base' },
  xl: { wh: 'w-16 h-16', dot: 'w-3.5 h-3.5 border-2', text: 'text-xl' },
};

export function Avatar({ name = 'U', src, size = 'md', status }: {
  name?: string; src?: string; size?: string; status?: Status;
}) {
  const { wh, dot, text } = avatarSizes[size] ?? avatarSizes.md;
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className={`relative inline-flex flex-shrink-0 ${wh} rounded-full`}>
      {src
        ? <img src={src} alt={name} className={`${wh} rounded-full object-cover`} />
        : <div className={`${wh} rounded-full bg-[#DCEBDD] flex items-center justify-center text-[#1D5149] font-semibold ${text}`} style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{initials}</div>
      }
      {status && <span className={`absolute bottom-0 right-0 ${dot} rounded-full border-white`} style={{ backgroundColor: dotColor[status] }} />}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

const badgeCls: Record<string, string> = {
  default: 'bg-[#F1F5F9] text-[#475569]',
  primary: 'bg-[#DCEBDD] text-[#1D5149]',
  success: 'bg-[#D1FAE5] text-[#065F46]',
  warning: 'bg-[#FEF3C7] text-[#92400E]',
  danger: 'bg-[#FEE2E2] text-[#991B1B]',
  cyan: 'bg-[#CFFAFE] text-[#155E75]',
};

export function Badge({ variant = 'default', children }: { variant?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${badgeCls[variant]}`}>
      {children}
    </span>
  );
}
