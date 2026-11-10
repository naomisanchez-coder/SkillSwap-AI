import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { StudentShell, type StudentDestination } from '../components/AppShell';
import type { PublicDestination } from '../components/PublicChrome';
import type { StudentDashboardSnapshot } from '../data/student';
import { hasCompletePreferences, summarizeMentorReviews } from '../data/student';
import { publicMentors } from '../data/publicMentors';
import type { StudentService } from '../services/student';
import type { ProfileService } from '../services/profile';
import { emptyPreferences } from '../data/profileOptions';
import { emptyDiscoveryFilters, type DiscoveryFilters } from '../data/discovery';
import type { BookingDraft, BookingResult, BookingLedger } from '../data/booking';
import { RecommendationAssistant } from '../components/RecommendationAssistant';
import LandingPage from '../pages/LandingPage';
import PublicExplorePage from '../pages/PublicExplorePage';
import HowItWorksPage from '../pages/HowItWorksPage';
import ShareSkillsPage from '../pages/ShareSkillsPage';
import ProfileSetupPage from '../pages/ProfileSetupPage';
import StudentDashboardPage from '../pages/StudentDashboardPage';
import RecommendationsPage from '../pages/RecommendationsPage';
import MentorProfilePage from '../pages/MentorProfilePage';
import BookingFlowPage from '../pages/BookingFlowPage';
import SessionsHubPage from '../pages/SessionsHubPage';
import CreditsHubPage from '../pages/CreditsHubPage';
import { mockProfileService } from './profileMock';
import { mockStudentService } from './studentMock';

type Page = PublicDestination | 'profile-setup' | 'dashboard' | 'discover' | 'explore' | 'mentor' | 'booking' | 'sessions' | 'wallet' | 'loading';
type MentorOrigin = Exclude<Page, 'mentor' | 'booking' | 'loading'>;
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
  const [bookingDraft, setBookingDraft] = useState<BookingDraft | null>(null);
  const returnPosition = useRef<{ scrollY: number; mentorId: string; fromAssistant: boolean } | null>(null);
  const restoring = useRef(false);
  const reading = useRef(new Set<string>());
  useEffect(() => {
    let active = true;
    Promise.all([studentService.getDashboard(), studentService.getBookingDraft()]).then(([next, draft]) => {
      if (!active) return;
      setSnapshot(next);
      if (hasCompletePreferences(next.state.profile) && draft) { setBookingDraft(draft); setMentorId(draft.mentorId); setPage('booking'); }
      else {
        let saved = ''; try { saved = sessionStorage.getItem('skillswap:frontend:page') ?? ''; } catch { /* Navegación en memoria. */ }
        setPage(hasCompletePreferences(next.state.profile) ? (saved === 'sessions' || saved === 'wallet' ? saved : 'dashboard') : 'profile-setup');
      }
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
    try { sessionStorage.setItem('skillswap:frontend:page', next); } catch { /* No afecta datos ni créditos. */ }
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const privateNavigate = (next: StudentDestination) => {
    if (next === 'dashboard' || next === 'discover' || next === 'explore' || next === 'sessions' || next === 'wallet') navigate(next);
    else if (next === 'profile') navigate('profile-setup');
    else setPending('Mis habilidades');
  };
  const openMentor = (id: string) => {
    setMentorOrigin(page === 'mentor' || page === 'booking' || page === 'loading' ? 'dashboard' : page);
    returnPosition.current = { scrollY: window.scrollY, mentorId: id, fromAssistant: Boolean(document.activeElement?.closest('[aria-labelledby="assistant-title"]')) };
    setMentorId(id);
    navigate('mentor');
  };
  const startBooking = async () => {
    if (!snapshot || !hasCompletePreferences(snapshot.state.profile)) { navigate('profile-setup'); return; }
    await studentService.clearBookingDraft();
    setBookingDraft(null);
    navigate('booking');
  };
  const leaveBooking = async (destination: 'mentor' | 'dashboard' | 'sessions' | 'wallet') => {
    await studentService.clearBookingDraft();
    setBookingDraft(null);
    navigate(destination);
  };
  const confirmedBooking = (result: BookingResult) => {
    changedActivity(result.ledger);
  };
  const changedActivity = (ledger: BookingLedger) => {
    setSnapshot(current => {
      if (!current) return current;
      const ratings = { ...current.state.mentorRatings };
      const previous = current.state.activity?.reviews ?? [];
      const reviews = [...ledger.reviews, ...(current.state.reviews ?? []).filter(item => !previous.some(old => old.id === item.id))];
      for (const mentor of current.mentors) ratings[mentor.id] = summarizeMentorReviews(reviews, mentor.id);
      const read = new Set(current.state.notifications.filter(item => item.read).map(item => item.id));
      return { ...current, state: { ...current.state, activity: ledger, wallet: ledger.wallet, sessions: ledger.sessions, mentorRatings: ratings, reviews,
        notifications: [...ledger.notifications.map(item => ({ ...item, read: read.has(item.id) })), ...current.state.notifications.filter(item => !ledger.notifications.some(next => next.id === item.id))] } };
    });
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
    {(page === 'dashboard' || page === 'discover' || page === 'explore' || page === 'sessions' || page === 'wallet') && snapshot && <StudentShell active={page} userName={snapshot.state.profile.name} userPhoto={snapshot.state.profile.photo} credits={snapshot.state.wallet.available}
      notifications={snapshot.state.notifications.filter(item => item.userId === snapshot.state.profile.id)} onReadNotification={id => void markRead(id)}
      onNavigate={privateNavigate} onPublicHome={() => navigate('landing')} onLogout={() => setPending('Cerrar sesión')}
      teachingAction={{ label: 'Quiero ser mentor', onClick: () => setPending('Solicitud para compartir una habilidad') }}>
      {page === 'dashboard' && <StudentDashboardPage state={snapshot.state} mentors={snapshot.mentors} onExplore={() => navigate('explore')}
        onDiscover={() => navigate('discover')} onSessions={() => navigate('sessions')} onWallet={() => navigate('wallet')}
        onMentorRequest={() => setPending('Solicitud para compartir una habilidad')} onMentor={openMentor} onEditPreferences={() => navigate('profile-setup')} />}
      {(page === 'discover' || page === 'explore') && <RecommendationsPage key={page} mentors={snapshot.mentors} profile={snapshot.state.profile} ratings={snapshot.state.mentorRatings}
        recommended={page === 'explore'} filters={filters} onFiltersChange={setFilters} onViewMentor={openMentor} onEditPreferences={() => navigate('profile-setup')} />}
      {page === 'sessions' && snapshot.state.activity && <SessionsHubPage ledger={snapshot.state.activity} service={studentService} onChanged={changedActivity} onExplore={() => navigate('discover')} />}
      {page === 'wallet' && snapshot.state.activity && <CreditsHubPage state={snapshot.state.activity} />}
      {(page === 'sessions' || page === 'wallet') && <RecommendationAssistant mentors={snapshot.mentors} profile={snapshot.state.profile} ratings={snapshot.state.mentorRatings} onViewMentor={openMentor} />}
    </StudentShell>}
    {page === 'mentor' && snapshot && <MentorProfilePage key={mentorId} profile={snapshot.state.profile} mentorId={mentorId} service={studentService}
      onBack={() => { restoring.current = true; navigate(mentorOrigin); }} onBooking={() => void startBooking()} />}
    {page === 'booking' && snapshot && <BookingFlowPage key={mentorId} mentorId={mentorId} draft={bookingDraft} service={studentService} onConfirmed={confirmedBooking}
      onBack={() => void leaveBooking('mentor')} onHome={() => void leaveBooking('dashboard')} onBuyCredits={() => void leaveBooking('wallet')} onSessions={() => void leaveBooking('sessions')} />}
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
