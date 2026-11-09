import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthError, getSession, type AuthSession } from '../services/auth';

type SessionState =
  | { status: 'checking' }
  | { status: 'authenticated'; session: AuthSession }
  | { status: 'anonymous'; message?: string }
  | { status: 'unavailable'; message: string };

/** La sesión y el CSRF solo viven en memoria; la cookie pertenece al navegador. */
export function useAuthSession() {
  const [state, setState] = useState<SessionState>({ status: 'checking' });
  const recovery = useRef<AbortController | null>(null);
  const hadSession = useRef(false);

  const loadSession = useCallback((controller: AbortController) =>
    getSession(controller.signal).then(session => {
      if (!controller.signal.aborted) {
        hadSession.current = true;
        setState({ status: 'authenticated', session });
      }
    }, (error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof AuthError && [401, 403].includes(error.status)) {
        const message = error.status === 403 || hadSession.current ? error.message : undefined;
        hadSession.current = false;
        setState({ status: 'anonymous', message });
      } else {
        setState({ status: 'unavailable', message: 'No pudimos comprobar tu sesión. Revisa la conexión y vuelve a intentarlo.' });
      }
    }), []);

  const recoverSession = useCallback(() => {
    recovery.current?.abort();
    const controller = new AbortController();
    recovery.current = controller;
    setState({ status: 'checking' });
    return loadSession(controller);
  }, [loadSession]);

  const acceptSession = useCallback((session: AuthSession) => {
    // Una recuperación anterior nunca debe sobrescribir un login posterior.
    recovery.current?.abort();
    hadSession.current = true;
    setState({ status: 'authenticated', session });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    recovery.current = controller;
    void loadSession(controller);
    return () => recovery.current?.abort();
  }, [loadSession]);

  return { state, recoverSession, acceptSession };
}
