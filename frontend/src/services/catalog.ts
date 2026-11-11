import type { Mentor } from '../data/mentors';
export interface CatalogService { getMentors(): Promise<Mentor[]>; subscribe?: (changed: () => void) => () => void }
/** Fuente referencial actual; el adaptador API sustituirá este servicio al integrar. */
export const referenceCatalogService: CatalogService = { async getMentors() { return []; } };
export function notifyCatalogChanged() { if (typeof window !== 'undefined') window.dispatchEvent(new Event('skillswap:catalog-changed')); }
