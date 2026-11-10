import { useEffect, useState } from 'react';

/** URLs temporales solo en memoria. Descarta respuestas tardías y libera cada URL al cambiar de archivo. */
export function useStoredFile(id: string | undefined, load: (id: string) => Promise<Blob | null>) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ id: string; attempt: number; url: string; error: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let active = true; let url = '';
    load(id).then(blob => {
      if (!active) return;
      if (!blob) throw new Error('El archivo no está disponible en este navegador. Vuelve a adjuntarlo cuando corresponda.');
      url = URL.createObjectURL(blob); setState({ id, attempt, url, error: '' });
    }).catch(error => {
      if (active) setState({ id, attempt, url: '', error: error instanceof Error ? error.message : 'No pudimos recuperar el archivo de este navegador.' });
    });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [id, load, attempt]);
  const current = state && state.id === id && state.attempt === attempt ? state : null;
  return { url: current?.url || '', error: current?.error || '', loading: Boolean(id && !current), retry: () => setAttempt(value => value + 1) };
}
