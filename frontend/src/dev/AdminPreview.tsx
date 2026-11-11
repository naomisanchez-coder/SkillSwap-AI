import { useEffect, useRef, useState } from 'react';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/ui';
import AdminOperationsPage from '../pages/AdminOperationsPage';
import { adminIdentity, type AdminSnapshot } from '../data/admin';
import { enterAdminPreview, mockAdminService, restoreAdminPreview } from './adminMock';

export default function AdminPreview({ onLogout }: { onLogout: () => void }) {
  const [access, setAccess] = useState(() => { try { return restoreAdminPreview(); } catch { return false; } });
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null); useEffect(() => { heading.current?.focus(); }, [access]);
  useEffect(() => { const refresh = (event: StorageEvent) => { if (event.key === 'skillswap:frontend-demo:account:v1' || event.key === 'skillswap:frontend-demo:bookings:v1') setAttempt(value => value + 1); }; window.addEventListener('storage', refresh); return () => window.removeEventListener('storage', refresh); }, []);
  useEffect(() => {
    if (!access) return; let active = true;
    mockAdminService.getSnapshot().then(value => { if (active) setSnapshot(value); }, caught => { if (active) setError(caught instanceof Error ? caught.message : 'No pudimos recuperar la administración.'); });
    return () => { active = false; };
  }, [access, attempt]);
  const back = () => { location.href = location.pathname; };
  if (!access) return <AuthLayout onBack={back}><h2 ref={heading} tabIndex={-1} className="text-3xl font-bold">Acceso de administración</h2><p className="mt-4 text-[#60716C]">{adminIdentity.name}</p><p className="mt-2 text-sm">{adminIdentity.email}</p><Button full className="mt-8" onClick={() => { try { enterAdminPreview(); setError(''); setAccess(true); } catch { setError('No pudimos iniciar el acceso en este navegador. Habilita el almacenamiento e inténtalo nuevamente.'); } }}>Acceder a administración</Button>{error && <p role="alert" className="mt-4 text-[#B54747]">{error}</p>}</AuthLayout>;
  if (error) return <main className="max-w-xl mx-auto p-6"><h1 className="text-2xl font-bold">No pudimos abrir la administración</h1><p role="alert" className="my-5">{error}</p><Button onClick={() => { setError(''); setAttempt(value => value + 1); }}>Reintentar</Button><Button variant="outline" onClick={back}>Volver al inicio</Button></main>;
  if (!snapshot) return <p role="status" className="p-6">Cargando administración…</p>;
  return <AdminOperationsPage snapshot={snapshot} service={mockAdminService} onChanged={setSnapshot} onLogout={() => { try { onLogout(); } catch { setError('No pudimos limpiar el acceso de este navegador. Vuelve a intentarlo.'); } }} />;
}
