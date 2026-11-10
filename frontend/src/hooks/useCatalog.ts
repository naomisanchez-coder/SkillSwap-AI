import { useEffect, useState } from 'react';
import type { Mentor } from '../data/mentors';
import type { CatalogService } from '../services/catalog';
export function useCatalog(service: CatalogService) {
  const [state, setState] = useState<{ mentors: Mentor[]; loading: boolean; error: string }>({ mentors: [], loading: true, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; let revision = 0;
    const load = () => {
      const request = ++revision;
      service.getMentors().then(mentors => { if (active && request === revision) setState({ mentors, loading: false, error: '' }); }, error => { if (active && request === revision) setState({ mentors: [], loading: false, error: error instanceof Error ? error.message : 'No pudimos recuperar el catálogo. Vuelve a intentarlo.' }); });
    };
    load(); const unsubscribe = service.subscribe?.(load);
    return () => { active = false; unsubscribe?.(); };
  }, [service, attempt]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}
