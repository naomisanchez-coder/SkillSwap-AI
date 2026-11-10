import { BookingError } from '../data/booking';
import { bookingStorageKey } from './bookingStore';
/** Control local de estado para el desarrollo; la API será la autoridad de permisos. */
export function assertLocalAccountActive() {
  const raw = localStorage.getItem(bookingStorageKey);
  if (!raw) return;
  let value: { suspendedUserIds?: string[] };
  try { value = JSON.parse(raw); } catch { throw new BookingError('storage_invalid', 'No pudimos recuperar el estado de la cuenta. No se modificaron tus datos.'); }
  if (value.suspendedUserIds?.includes('frontend-demo-student')) throw new BookingError('account_suspended', 'Esta cuenta está suspendida. Contacta a administración.');
}
