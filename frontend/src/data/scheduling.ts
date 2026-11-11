// Funciones de scheduling.ts de Figma Make; intervalos semiabiertos [inicio, fin).
export type WeeklyAvailability = Record<string, string[]>;
const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export type ScheduledInterval = { id: string; mentorId: string; date: string; time: string; duration: number; status: string };

export function dayNameFromISO(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return '';
  return dayNames[parsed.getUTCDay()];
}
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

export function getNextAvailableDates(
  availability: WeeklyAvailability,
  amount = 8,
  from = new Date(),
): string[] {
  const dates: string[] = [];
  const limaParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(from);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(limaParts.find(item => item.type === type)?.value);
  const base = new Date(Date.UTC(part('year'), part('month') - 1, part('day'), 12));
  for (let offset = 1; offset <= 56 && dates.length < amount; offset += 1) {
    const candidate = new Date(base);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    const day = dayNames[candidate.getUTCDay()];
    if ((availability[day] ?? []).length === 0) continue;
    const year = candidate.getUTCFullYear();
    const month = String(candidate.getUTCMonth() + 1).padStart(2, '0');
    const date = String(candidate.getUTCDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${date}`);
  }
  return dates;
}

export function intervalSlotKeys(
  mentorId: string,
  date: string,
  time: string,
  duration: number,
): string[] {
  const start = parseTime(time);
  if (!Number.isFinite(start)) return [];
  const keys: string[] = [];
  for (let minute = start; minute < start + duration; minute += 30) {
    keys.push(`${mentorId}:${date}:${formatTime(minute)}`);
  }
  return keys;
}

export function isWithinAvailability(
  availability: WeeklyAvailability,
  date: string,
  time: string,
  duration: number,
): boolean {
  const day = dayNameFromISO(date);
  const availableStarts = (availability[day] ?? []).map(parseTime).filter(Number.isFinite);
  const start = parseTime(time);
  if (!Number.isFinite(start) || !availableStarts.includes(start)) return false;

  for (let minute = start; minute < start + duration; minute += 30) {
    const covered = availableStarts.some(blockStart => minute >= blockStart && minute < blockStart + 60);
    if (!covered) return false;
  }
  return true;
}

export function sessionsOverlap(
  session: ScheduledInterval,
  mentorId: string,
  date: string,
  time: string,
  duration: number,
): boolean {
  if (session.mentorId !== mentorId || session.date !== date || session.status === 'cancelled') return false;
  const requestedStart = parseTime(time);
  const existingStart = parseTime(session.time);
  if (!Number.isFinite(requestedStart) || !Number.isFinite(existingStart)) return false;
  return requestedStart < existingStart + session.duration
    && existingStart < requestedStart + duration;
}

export function isSlotAvailable({
  mentorId,
  date,
  time,
  duration,
  availability,
  sessions,
  reservedSlots,
}: {
  mentorId: string;
  date: string;
  time: string;
  duration: number;
  availability: WeeklyAvailability;
  sessions: ScheduledInterval[];
  reservedSlots: string[];
}): boolean {
  if (!isWithinAvailability(availability, date, time, duration)) return false;
  const keys = intervalSlotKeys(mentorId, date, time, duration);
  if (keys.length === 0 || keys.some(key => reservedSlots.includes(key))) return false;
  return !sessions.some(session => sessionsOverlap(session, mentorId, date, time, duration));
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
