import type { AccountData } from './account';
import type { BookingLedger } from './booking';
import type { Mentor } from './mentors';
import { mentorOwnerId, publishedMentors } from './mentor';
/** Una oferta por habilidad aprobada; el estado de la cuenta prevalece sobre publicación. */
export function composeMentorCatalog(base: Mentor[], account: AccountData, ledger: BookingLedger, name: string): Mentor[] {
  const own = publishedMentors(account, ledger, { name: account.profile.name ?? name, bio: account.profile.bio ?? '' });
  return [...structuredClone(base), ...own].map(item => ({ ...item, active: item.active !== false && !ledger.suspendedUserIds?.includes(item.ownerUserId ?? mentorOwnerId(item.id)) }));
}
