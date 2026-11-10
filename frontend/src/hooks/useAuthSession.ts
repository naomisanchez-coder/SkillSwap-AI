import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthError, getSession, logoutSession, type AuthSession } from '../services/auth';

type SessionState =
  | { status: 'checking' }
  | { status: 'authenticated'; session: AuthSession }
  | { status: 'anonymous'; message?: string }
  | { status: 'unavailable'; message: string };

/** La sesión y el CSRF solo viven en memoria; la cookie pertenece al navegador. */
export function useAuthSession(enabled = true) {
  const [state, setState] = useState<SessionState>(enabled ? { status: 'checking' } : { status: 'anonymous' });
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const signingOut = useRef(false);
  const logoutRequest = useRef<AbortController | null>(null);
  const recovery = useRef<AbortController | null>(null);
  const hadSession = useRef(false);

  const loadSession = useCallback((controller: AbortController) =>
    getSession(controller.signal).then(session => {
      if (!controller.signal.aborted) {
        hadSession.current = true;
        setLogoutError('');
        setState({ status: 'authenticated', session });
      }
    }, (error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof AuthError && [401, 403].includes(error.status)) {
        const message = error.status === 403 || hadSession.current ? error.message : undefined;
        hadSession.current = false;
        setLogoutError('');
        setState({ status: 'anonymous', message });
      } else {
        setState({ status: 'unavailable', message: 'No pudimos comprobar tu sesión. Revisa la conexión y vuelve a intentarlo.' });
      }
    }), []);

  const recoverSession = useCallback(() => {
    if (!enabled || signingOut.current) return Promise.resolve();
    recovery.current?.abort();
    const controller = new AbortController();
    recovery.current = controller;
    setState({ status: 'checking' });
    return loadSession(controller);
  }, [loadSession, enabled]);

  const logout = async () => {
    if (signingOut.current || state.status !== 'authenticated') return false;
    signingOut.current = true; setLoggingOut(true); setLogoutError(''); recovery.current?.abort();
    const controller = new AbortController(); logoutRequest.current = controller;
    try {
      await logoutSession(state.session.csrfToken, controller.signal);
      if (controller.signal.aborted) return false;
      hadSession.current = false; setState({ status: 'anonymous' }); return true;
    } catch (error) { if (!controller.signal.aborted) setLogoutError(error instanceof Error ? error.message : 'No pudimos cerrar tu sesión. Vuelve a intentarlo.'); return false; }
    finally { signingOut.current = false; if (!controller.signal.aborted) setLoggingOut(false); }
  };

  const acceptSession = useCallback((session: AuthSession) => {
    // Una recuperación anterior nunca debe sobrescribir un login posterior.
    recovery.current?.abort();
    hadSession.current = true;
    setLogoutError('');
    setState({ status: 'authenticated', session });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    recovery.current = controller;
    void loadSession(controller);
    return () => { recovery.current?.abort(); logoutRequest.current?.abort(); };
  }, [loadSession, enabled]);
  useEffect(() => { const restore = (event: PageTransitionEvent) => { if (event.persisted) void recoverSession(); }; window.addEventListener('pageshow', restore); return () => window.removeEventListener('pageshow', restore); }, [recoverSession]);

  return { state, recoverSession, acceptSession, logout, loggingOut, logoutError };
}
