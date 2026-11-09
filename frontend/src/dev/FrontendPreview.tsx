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
import { emptyDiscoveryFilters, type DiscoveryFilters } from '../data/discovery';
import LandingPage from '../pages/LandingPage';
import PublicExplorePage from '../pages/PublicExplorePage';
import HowItWorksPage from '../pages/HowItWorksPage';
import ShareSkillsPage from '../pages/ShareSkillsPage';
import ProfileSetupPage from '../pages/ProfileSetupPage';
import StudentDashboardPage from '../pages/StudentDashboardPage';
import RecommendationsPage from '../pages/RecommendationsPage';
import MentorProfilePage from '../pages/MentorProfilePage';
import { mockProfileService } from './profileMock';
import { mockStudentService } from './studentMock';

type Page = PublicDestination | 'profile-setup' | 'dashboard' | 'discover' | 'explore' | 'mentor' | 'loading';
type MentorOrigin = Exclude<Page, 'mentor' | 'loading'>;
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
  const [filters, setFilters] = useState<DiscoveryFilters>(emptyDiscoveryFilters);
  const [publicQuery, setPublicQuery] = useState('');
  const [mentorId, setMentorId] = useState('');
  const [mentorOrigin, setMentorOrigin] = useState<MentorOrigin>('dashboard');
  const returnPosition = useRef<{ scrollY: number; mentorId: string; fromAssistant: boolean } | null>(null);
  const restoring = useRef(false);
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
  useEffect(() => {
    if (!restoring.current || page !== mentorOrigin) return;
    const position = returnPosition.current;
    restoring.current = false;
    if (!position) return;
    const frame = requestAnimationFrame(() => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-mentor-id]'));
      const card = buttons.find(button => button.dataset.mentorId === position.mentorId);
      const assistant = document.querySelector<HTMLButtonElement>('[aria-label="Abrir Asistente SkillSwap"]');
      (position.fromAssistant ? assistant : card)?.focus({ preventScroll: true });
      window.scrollTo({ top: position.scrollY, behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [page, mentorOrigin]);
  const navigate = (next: Page) => {
    setPending(null);
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const privateNavigate = (next: StudentDestination) => {
    if (next === 'dashboard' || next === 'discover' || next === 'explore') navigate(next);
    else if (next === 'profile') navigate('profile-setup');
    else setPending(({ sessions: 'Mis sesiones', wallet: 'Mis créditos', skills: 'Mis habilidades' })[next]);
  };
  const openMentor = (id: string) => {
    setMentorOrigin(page === 'mentor' || page === 'loading' ? 'dashboard' : page);
    returnPosition.current = { scrollY: window.scrollY, mentorId: id, fromAssistant: Boolean(document.activeElement?.closest('[aria-labelledby="assistant-title"]')) };
    setMentorId(id);
    navigate('mentor');
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
    {(page === 'dashboard' || page === 'discover' || page === 'explore') && snapshot && <StudentShell active={page} userName={snapshot.state.profile.name} userPhoto={snapshot.state.profile.photo} credits={snapshot.state.wallet.available}
      notifications={snapshot.state.notifications.filter(item => item.userId === snapshot.state.profile.id)} onReadNotification={id => void markRead(id)}
      onNavigate={privateNavigate} onPublicHome={() => navigate('landing')} onLogout={() => setPending('Cerrar sesión')}
      teachingAction={{ label: 'Quiero ser mentor', onClick: () => setPending('Solicitud para compartir una habilidad') }}>
      {page === 'dashboard' && <StudentDashboardPage state={snapshot.state} mentors={snapshot.mentors} onExplore={() => navigate('explore')}
        onDiscover={() => navigate('discover')} onSessions={() => setPending('Mis sesiones')} onWallet={() => setPending('Mis créditos')}
        onMentorRequest={() => setPending('Solicitud para compartir una habilidad')} onMentor={openMentor} onEditPreferences={() => navigate('profile-setup')} />}
      {(page === 'discover' || page === 'explore') && <RecommendationsPage key={page} mentors={snapshot.mentors} profile={snapshot.state.profile} ratings={snapshot.state.mentorRatings}
        recommended={page === 'explore'} filters={filters} onFiltersChange={setFilters} onViewMentor={openMentor} onEditPreferences={() => navigate('profile-setup')} />}
    </StudentShell>}
    {page === 'mentor' && snapshot && <MentorProfilePage key={mentorId} profile={snapshot.state.profile} mentorId={mentorId} service={studentService}
      onBack={() => { restoring.current = true; navigate(mentorOrigin); }} onBooking={() => setPending('Reservar sesión')} />}
    {page === 'landing' && <LandingPage {...actions} />}
    {page === 'public-explore' && <PublicExplorePage {...actions} mentors={publicMentors} searchQuery={publicQuery} onSearchChange={setPublicQuery} onPrivateExplore={() => navigate(snapshot && hasCompletePreferences(snapshot.state.profile) ? 'explore' : 'profile-setup')} onMentor={openMentor} />}
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
