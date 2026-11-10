import type { BookingLedger } from '../data/booking';
import type { WalletBalance } from '../data/student';
import { academicSessionCost } from '../data/creditConfig';
import { dayNameFromISO, intervalSlotKeys, parseTime } from '../data/scheduling';
import { normalizeAvailability, normalizeOffer, sessionMentorOwner } from '../data/mentor';

/** Lee también las reservas v1 previas a sesiones/billetera sin reiniciar su saldo. */
export function validateLedger(value: BookingLedger, studentId: string, initial: WalletBalance, participantInitials: Record<string, WalletBalance> = {}): BookingLedger {
  const invalid = () => { throw new Error('Invalid ledger'); };
  value.incidents ??= []; value.reviews ??= []; value.mentorBalances ??= {};
  value.wallets ??= structuredClone(participantInitials); value.mentorSettings ??= {};
  if (value.version !== 1 || value.studentId !== studentId || !value.wallet || !Array.isArray(value.sessions) || !Array.isArray(value.movements) || !Array.isArray(value.notifications) || !Array.isArray(value.incidents) || !Array.isArray(value.reviews) || typeof value.mentorBalances !== 'object' || Array.isArray(value.mentorBalances)) invalid();
  if (![value.sessions, value.movements, value.notifications, value.incidents, value.reviews].every(items => items.every(item => item && typeof item.id === 'string') && new Set(items.map(item => item.id)).size === items.length)) invalid();
  if (new Set(value.movements.map(item => item.reference)).size !== value.movements.length) invalid();
  const expectedWallets = { ...Object.fromEntries(Object.entries(participantInitials).map(([id, wallet]) => [id, { ...wallet }])), [studentId]: { ...initial } };
  if (!value.wallets || Array.isArray(value.wallets) || !value.mentorSettings || Array.isArray(value.mentorSettings)) invalid();
  for (const settings of Object.values(value.mentorSettings)) {
    normalizeAvailability(settings.availability);
    if (!settings.offers || typeof settings.offers !== 'object') invalid();
    Object.values(settings.offers).forEach(normalizeOffer);
  }
  const mentorBalances: Record<string, number> = {};
  let movementCount = 0;
  for (const session of value.sessions) {
    if (!Object.hasOwn(expectedWallets, session.studentId) || sessionMentorOwner(session) === session.studentId || ![30, 60, 90].includes(session.duration) || session.credits !== academicSessionCost(session.duration)
      || !dayNameFromISO(session.date) || !Number.isFinite(parseTime(session.time)) || !['upcoming', 'active', 'validation', 'completed', 'cancelled', 'review'].includes(session.status)
      || typeof session.mentorId !== 'string' || typeof session.mentorName !== 'string' || !Number.isFinite(Date.parse(session.createdAt))
      || JSON.stringify(session.reservedSlotKeys) !== JSON.stringify(intervalSlotKeys(session.mentorId, session.date, session.time, session.duration))) invalid();
    const movement = (type: 'hold' | 'refund' | 'spent' | 'earning', amount: number, status: string) => {
      const items = value.movements.filter(item => item.reference === `${session.id}:${type}`);
      if (items.length !== 1 || items[0].sessionId !== session.id || items[0].type !== type || items[0].amount !== amount || items[0].status !== status || !Number.isFinite(Date.parse(items[0].createdAt))) invalid();
      if (type === 'earning' ? items[0].userId !== sessionMentorOwner(session) : (items[0].userId ?? studentId) !== session.studentId) invalid();
      movementCount++;
    };
    const expected = expectedWallets[session.studentId];
    expected.available -= session.credits;
    if (session.status === 'cancelled') {
      if (!session.cancelledAt) invalid();
      movement('hold', -session.credits, 'rejected'); movement('refund', session.credits, 'completed'); expected.available += session.credits;
    } else if (session.status === 'completed') {
      if (!session.performedAt || !session.validatedAt || !session.completedAt) invalid();
      movement('hold', -session.credits, 'completed'); movement('spent', -session.credits, 'completed'); movement('earning', session.credits, 'completed');
      expected.used += session.credits; mentorBalances[session.mentorId] = (mentorBalances[session.mentorId] ?? 0) + session.credits;
      const mentorWallet = expectedWallets[sessionMentorOwner(session)];
      if (mentorWallet) { mentorWallet.available += session.credits; mentorWallet.earned += session.credits; }
    } else {
      movement('hold', -session.credits, 'pending'); expected.held += session.credits;
      if (session.status === 'validation' && !session.performedAt) invalid();
      if (session.validatedAt) invalid();
    }
    const incidents = value.incidents.filter(item => item.sessionId === session.id && item.status !== 'closed');
    if ((session.status === 'review' ? incidents.length !== 1 : incidents.length !== 0)) invalid();
    const reviews = value.reviews.filter(item => item.sessionId === session.id);
    if (reviews.length !== (session.rated ? 1 : 0) || (session.rated && session.status !== 'completed')) invalid();
    if ([session.performedAt, session.validatedAt, session.cancelledAt, session.completedAt, session.reviewedAt].some(at => at !== undefined && !Number.isFinite(Date.parse(at)))) invalid();
    if (session.history && (new Set(session.history.map(item => item.id)).size !== session.history.length || session.history.some(item => !Number.isFinite(Date.parse(item.at)) || !item.label))) invalid();
    for (const review of reviews) if (review.studentId !== session.studentId || review.mentorId !== session.mentorId || !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5 || review.rating !== session.rating || review.comment.length > 500) invalid();
    if (!value.notifications.some(item => item.id === `NOT-${session.id}-booked-student` && item.userId === session.studentId && item.target === 'sessions')) invalid();
  }
  if (movementCount !== value.movements.length || Object.keys(value.wallets).some(id => !Object.hasOwn(participantInitials, id))) invalid();
  for (const [id, expected] of Object.entries(expectedWallets)) {
    const actual = id === studentId ? value.wallet : value.wallets[id];
    if (!actual || Object.keys(expected).some(key => actual[key as keyof WalletBalance] !== expected[key as keyof WalletBalance] || !Number.isSafeInteger(expected[key as keyof WalletBalance]) || expected[key as keyof WalletBalance] < 0)) invalid();
  }
  if (Object.keys({ ...mentorBalances, ...value.mentorBalances }).some(id => mentorBalances[id] !== value.mentorBalances[id])) invalid();
  if (value.incidents.some(item => !value.sessions.some(session => session.id === item.sessionId) || !['open', 'in_review', 'closed'].includes(item.status) || !item.reason.trim() || item.reason.length > 1000)) invalid();
  if (value.reviews.some(item => !value.sessions.some(session => session.id === item.sessionId))) invalid();
  return value;
}
