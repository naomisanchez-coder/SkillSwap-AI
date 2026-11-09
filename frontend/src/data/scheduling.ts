// Funciones de scheduling.ts de Figma Make; intervalos semiabiertos [inicio, fin).
export function parseTime(time: string): number {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || Number(match[2]) > 59) return Number.NaN;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  return hour * 60 + Number(match[2]);
}

export function formatTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function formatSessionDate(date: string, options?: Intl.DateTimeFormatOptions): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    ...(options ?? {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    }),
  }).format(new Date(`${date}T12:00:00-05:00`));
}

export function formatSessionTime(time: string): string {
  const minutes = parseTime(time);
  return Number.isFinite(minutes) ? formatTime(minutes) : time;
}

export function formatSessionSchedule(
  date: string,
  time: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return `${formatSessionDate(date, options)} · ${formatSessionTime(time)}`;
}


/** Misma condición de solapamiento de sessionsOverlap del prototipo. */
export function intervalsOverlap(start: number, end: number, otherStart: number, otherEnd: number): boolean {
  return [start, end, otherStart, otherEnd].every(Number.isFinite)
    && start < end && otherStart < otherEnd && start < otherEnd && otherStart < end;
}

export function preferenceIntervals(preference: string): Array<{ day: string; start: number; end: number }> {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const times = preference.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/gi) ?? [];
  if (!times.length) return [];
  const start = parseTime(times[0] ?? '');
  const end = times[1] ? parseTime(times[1]) : start + 60;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return [];
  return ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
    .filter(day => normalize(preference).includes(normalize(day)))
    .map(day => ({ day, start, end }));
}
