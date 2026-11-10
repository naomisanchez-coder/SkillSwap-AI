import { useEffect, useState } from 'react';
import FrontendPreview from './FrontendPreview';
import AdminPreview from './AdminPreview';
import PublicApp from '../PublicApp';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/ui';
import { previewAccess, previewLogoutKey } from './previewAccess';
import { mockCatalogService } from './catalogMock';
import { previewRegistration, localVerificationService } from './registrationPreview';

type View = 'student' | 'admin' | 'public' | 'entry' | 'real' | 'real-register' | 'register' | 'login';
function currentView(): View {
  try {
    const view = new URLSearchParams(location.search).get('view');
    if (view === 'admin') return 'admin';
    if (view === 'register' || view === 'login') return view;
    if (view === 'api') return 'real';
    if (view === 'api-register') return 'real-register';
    const access = previewAccess().read();
    if (view === 'student') return access === 'student' ? 'student' : 'entry';
    return access === 'student' ? 'student' : 'public';
  } catch { return 'public'; }
}
export default function DevelopmentApp() {
  const [view, setView] = useState<View>(currentView); const [error, setError] = useState('');

  const [verificationService] = useState(localVerificationService);
  const publicHome = () => { history.replaceState(null, '', location.pathname); setView('public'); window.scrollTo({ top: 0, behavior: 'instant' }); requestAnimationFrame(() => { const heading = document.querySelector('h1'); if (heading) { heading.tabIndex = -1; heading.focus(); } }); };
  const logout = () => { previewAccess().logout(); publicHome(); };
  useEffect(() => {
    const storage = (event: StorageEvent) => { if (event.key === previewLogoutKey) { try { previewAccess().clear(); } catch { /* La época compartida invalida igualmente el acceso. */ } publicHome(); } };
    const restore = () => { try { if (previewAccess().read() === 'public') { publicHome(); return; } } catch { publicHome(); return; } setView(currentView()); };
    const show = (event: PageTransitionEvent) => { if (event.persisted) restore(); };
    window.addEventListener('storage', storage); window.addEventListener('popstate', restore); window.addEventListener('pageshow', show);
    return () => { window.removeEventListener('storage', storage); window.removeEventListener('popstate', restore); window.removeEventListener('pageshow', show); };
  }, []);
  const openAccess = (page: 'login' | 'register') => { setView(page); };
  if (view === 'admin') return <AdminPreview onLogout={logout} />;
  if (view === 'student') return <FrontendPreview onRealAccess={openAccess} onLogout={logout} />;
  if (view === 'entry') return <AuthLayout onBack={publicHome}><h2 tabIndex={-1} className="text-3xl font-bold">Acceso de estudiante</h2><p className="mt-4 text-[#60716C]">Alex · Comunidad TECSUP</p><Button full className="mt-8" onClick={() => { try { previewAccess().enter('student'); setView('student'); } catch { setError('No pudimos abrir el acceso en este navegador. Vuelve a intentarlo.'); } }}>Acceder como estudiante</Button>{error && <p role="alert" className="mt-4 text-[#B54747]">{error}</p>}</AuthLayout>;
  const real = view === 'real' || view === 'real-register';
  return <PublicApp key={view} initialPage={view === 'real' || view === 'login' ? 'login' : view === 'register' || view === 'real-register' ? 'register' : 'landing'} apiSession={real && import.meta.env.VITE_ENABLE_API_SESSION === 'true'} catalogService={mockCatalogService}
    registrationService={real ? undefined : previewRegistration} verificationService={real ? undefined : verificationService}
    onLocalVerified={real ? undefined : () => { previewAccess().enter('student'); history.replaceState(null, '', location.pathname); setView('student'); }} />;
}
