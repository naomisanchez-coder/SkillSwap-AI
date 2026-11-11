import { localActivity } from './localActivity';
import { isEligibleMentor } from '../data/recommendations';
import type { CatalogService } from '../services/catalog';
export const mockCatalogService: CatalogService = {
  async getMentors() {
    if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_FRONTEND_PREVIEW !== 'true') throw new Error('Catálogo de prueba no habilitado.');
    return (await localActivity.getMentorCatalog()).filter(mentor => isEligibleMentor(mentor));
  },
  subscribe(changed) {
    const storage = (event: StorageEvent) => { if (event.key === 'skillswap:frontend-demo:account:v1' || event.key === 'skillswap:frontend-demo:bookings:v1') changed(); };
    window.addEventListener('storage', storage); window.addEventListener('skillswap:catalog-changed', changed); window.addEventListener('focus', changed);
    return () => { window.removeEventListener('storage', storage); window.removeEventListener('skillswap:catalog-changed', changed); window.removeEventListener('focus', changed); };
  },
};
