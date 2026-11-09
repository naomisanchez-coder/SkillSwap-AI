import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { StudentShell, type StudentDestination } from '../components/AppShell';
import type { PublicDestination } from '../components/PublicChrome';
import type { StudentDashboardSnapshot } from '../data/student';
import { hasCompletePreferences } from '../data/student';
import { publicMentors } from '../data/publicMentors';
import type { StudentService } from '../services/student';
import type { ProfileService } from '../services/profile';
import { emptyPreferences } from '../data/profileOptions';
import LandingPage from '../pages/LandingPage';
import PublicExplorePage from '../pages/PublicExplorePage';
import HowItWorksPage from '../pages/HowItWorksPage';
import ShareSkillsPage from '../pages/ShareSkillsPage';
import ProfileSetupPage from '../pages/ProfileSetupPage';
import StudentDashboardPage from '../pages/StudentDashboardPage';
import { mockProfileService } from './profileMock';
import { mockStudentService } from './studentMock';

type Page = PublicDestination | 'profile-setup' | 'dashboard' | 'loading';
/** Composición local independiente del acceso real. Los fixtures viven en los servicios. */
export default function FrontendPreview({ onRealAccess, studentService = mockStudentService, profileService = mockProfileService }: {
  onRealAccess: (page: 'login' | 'register') => void; studentService?: StudentService; profileService?: ProfileService;
}) {
  const [page, setPage] = useState<Page>('loading');
  const [snapshot, setSnapshot] = useState<StudentDashboardSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState(false);
  const reading = useRef(new Set<string>());
  useEffect(() => {
    let active = true;
    studentService.getDashboard().then(next => {
      if (!active) return;
      setSnapshot(next);
      setPage(hasCompletePreferences(next.state.profile) ? 'dashboard' : 'profile-setup');
    }, () => { if (active) { setLoadError(true); setPage('profile-setup'); } });
    return () => { active = false; };
  }, [studentService, attempt]);
  const navigate = (next: Page) => {
    setPending(null);
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const privateNavigate = (next: StudentDestination) => {
    if (next === 'dashboard') navigate('dashboard');
    else if (next === 'profile') navigate('profile-setup');
    else setPending(({ discover: 'Explorar mentores', explore: 'Para ti', sessions: 'Mis sesiones', wallet: 'Mis créditos', skills: 'Mis habilidades' })[next]);
  };
  const markRead = async (id: string) => {
    if (reading.current.has(id)) return;
    reading.current.add(id);
    try {
      await studentService.markNotificationRead(id);
      setSnapshot(current => current && ({ ...current, state: { ...current.state, notifications: current.state.notifications.map(item => item.id === id ? { ...item, read: true } : item) } }));
    } catch { setNotificationError(true); }
    finally { reading.current.delete(id); }
  };
  const actions = {
    userName: snapshot?.state.profile.name || 'Mi cuenta',
    onNavigate: navigate,
    onLogin: () => onRealAccess('login'),
    onRegister: () => onRealAccess('register'),
    onDashboard: () => navigate(snapshot && hasCompletePreferences(snapshot.state.profile) ? 'dashboard' : 'profile-setup'),
    onLogout: () => setPending('Cerrar sesión'),
  };
  return <>
    {page === 'loading' && <p role="status" className="p-6">Cargando tu espacio de aprendizaje…</p>}
    {loadError && <aside role="alert" className="border-b border-[#E8C2C2] bg-[#FFF3F0] p-4 text-[#B54747]">No pudimos cargar tu panel. Revisa las preferencias guardadas y vuelve a intentarlo. <Button variant="outline" onClick={() => { setLoadError(false); setPage('loading'); setAttempt(current => current + 1); }}>Reintentar</Button></aside>}
    {page === 'profile-setup' && <ProfileSetupPage service={profileService} startEditing onReset={() => setSnapshot(current => current && ({ ...current, state: { ...current.state, profile: { ...current.state.profile, ...emptyPreferences() } } }))} onBack={() => navigate(snapshot && hasCompletePreferences(snapshot.state.profile) ? 'dashboard' : 'landing')} onComplete={preferences => {
      // El callback solo se ejecuta después de que ProfileService confirme el guardado.
      setSnapshot(current => current ? { ...current, state: { ...current.state, profile: { ...current.state.profile, ...preferences } } } : null);
      if (snapshot) navigate('dashboard');
      else { setLoadError(false); setPage('loading'); setAttempt(current => current + 1); }
    }} />}
    {page === 'dashboard' && snapshot && <StudentShell active="dashboard" userName={snapshot.state.profile.name} userPhoto={snapshot.state.profile.photo} credits={snapshot.state.wallet.available}
      notifications={snapshot.state.notifications.filter(item => item.userId === snapshot.state.profile.id)} onReadNotification={id => void markRead(id)}
      onNavigate={privateNavigate} onPublicHome={() => navigate('landing')} onLogout={() => setPending('Cerrar sesión')}
      teachingAction={{ label: 'Quiero ser mentor', onClick: () => setPending('Solicitud para compartir una habilidad') }}>
      <StudentDashboardPage state={snapshot.state} mentors={snapshot.mentors} onExplore={() => setPending('Para ti')}
        onDiscover={() => setPending('Explorar mentores')} onSessions={() => setPending('Mis sesiones')} onWallet={() => setPending('Mis créditos')}
        onMentorRequest={() => setPending('Solicitud para compartir una habilidad')} onMentor={id => setPending(`Perfil de ${snapshot.mentors.find(mentor => mentor.id === id)?.name ?? 'mentor'}`)} onEditPreferences={() => navigate('profile-setup')} />
    </StudentShell>}
    {page === 'landing' && <LandingPage {...actions} />}
    {page === 'public-explore' && <PublicExplorePage {...actions} mentors={publicMentors} onPrivateExplore={() => setPending('Para ti')} onMentor={() => setPending('Perfil de mentor')} />}
    {page === 'how-it-works' && <HowItWorksPage {...actions} />}
    {page === 'share-skills' && <ShareSkillsPage {...actions} onStartSharing={() => setPending('Solicitud para compartir una habilidad')} />}
    {(pending || notificationError) && <Modal labelledBy="pending-destination-title" onClose={() => { setPending(null); setNotificationError(false); }}>
      <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="pending-destination-title" className="text-xl font-bold text-[#182B2A]">{notificationError ? 'No pudimos actualizar la notificación' : pending}</h2>
        <p className="mt-3 text-sm text-[#60716C]">{notificationError ? 'La notificación sigue sin leer. Puedes volver a abrirla e intentarlo de nuevo.' : 'Esta opción todavía no está disponible. Podrás acceder a ella en una próxima actualización.'}</p>
        <Button className="mt-5" onClick={() => { setPending(null); setNotificationError(false); }}>Entendido</Button>
      </section>
    </Modal>}
  </>;
}
