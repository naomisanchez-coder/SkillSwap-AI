import { lazy, Suspense } from 'react';
import PublicApp from './PublicApp';
const DevelopmentApp = import.meta.env.DEV ? lazy(() => import('./dev/DevelopmentApp')) : null;
export default function App() {
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_FRONTEND_PREVIEW === 'true' && DevelopmentApp) return <Suspense fallback={<p role="status">Cargando…</p>}><DevelopmentApp /></Suspense>;
  return <PublicApp initialPage="landing" />;
}
