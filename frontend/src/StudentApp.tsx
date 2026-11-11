import type { CatalogService } from './services/catalog';
import { useEffect, useRef, useState } from 'react';
import { Button } from './components/Button';
import { Modal } from './components/Modal';
import { StudentShell, type StudentDestination, type MentorDestination } from './components/AppShell';
import { MentorArea } from './components/MentorArea';
import type { MentorService } from './services/mentor';
import type { PublicDestination } from './components/PublicChrome';
import type { StudentDashboardSnapshot, NotificationRecord } from './data/student';
import { notificationDestination } from './data/notificationNavigation';
import { hasCompletePreferences, summarizeMentorReviews } from './data/student';
import { useCatalog } from './hooks/useCatalog';

import type { StudentService } from './services/student';
import type { ProfileService } from './services/profile';
import type { AccountService } from './services/account';
import { type AccountData } from './data/account';
import { useStoredFile } from './hooks/useStoredFile';
import { emptyPreferences } from './data/profileOptions';
import { emptyDiscoveryFilters, type DiscoveryFilters } from './data/discovery';
import type { BookingDraft, BookingResult, BookingLedger } from './data/booking';
import { RecommendationAssistant } from './components/RecommendationAssistant';
import LandingPage from './pages/LandingPage';
import PublicExplorePage from './pages/PublicExplorePage';
import HowItWorksPage from './pages/HowItWorksPage';
import ShareSkillsPage from './pages/ShareSkillsPage';
import ProfileSetupPage from './pages/ProfileSetupPage';
import StudentDashboardPage from './pages/StudentDashboardPage';
import RecommendationsPage from './pages/RecommendationsPage';
import MentorProfilePage from './pages/MentorProfilePage';
import BookingFlowPage from './pages/BookingFlowPage';
import SessionsHubPage from './pages/SessionsHubPage';
import CreditsHubPage from './pages/CreditsHubPage';
import { ProfilePage, SkillsPage, MentorApplicationPage } from './pages/AccountMentorPages';





const mentorPages = { 'mentor-dashboard': 'mentor-dashboard', sessions: 'mentor-sessions', offers: 'mentor-offers', availability: 'mentor-availability', skills: 'mentor-skills', reviews: 'mentor-reviews', earnings: 'mentor-earnings', profile: 'mentor-account' } as const;
type MentorPage = typeof mentorPages[MentorDestination];
type Page = PublicDestination | 'profile-setup' | 'dashboard' | 'discover' | 'explore' | 'mentor' | 'booking' | 'sessions' | 'wallet' | 'profile' | 'skills' | 'mentor-application' | 'loading' | MentorPage;
const isMentorPage = (value: string): value is MentorPage => Object.values(mentorPages).includes(value as MentorPage);
type MentorOrigin = Exclude<Page, 'mentor' | 'booking' | 'loading'>;
/** Composición local independiente del acceso real. Los fixtures viven en los servicios. */
export default function StudentApp({ onRealAccess, onLogout, studentService, profileService, accountService, mentorService, catalogService }: {
  onRealAccess: (page: 'login' | 'register') => void; onLogout: () => void; studentService: StudentService; profileService: ProfileService; accountService: AccountService; mentorService: MentorService; catalogService: CatalogService;
}) {
  const catalog = useCatalog(catalogService);
  const [logoutError, setLogoutError] = useState('');
  const logout = () => { try { onLogout(); } catch { setLogoutError('No pudimos cerrar el acceso de este navegador. Vuelve a intentarlo.'); } };
  const [page, setPage] = useState<Page>('loading');
  const [snapshot, setSnapshot] = useState<StudentDashboardSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState(false);
  const [notificationTargetError, setNotificationTargetError] = useState(false);
  const [notificationSelection, setNotificationSelection] = useState<{ type: 'session' | 'request'; id: string; key: number } | null>(null);
  const notificationSequence = useRef(0);
  const [filters, setFilters] = useState<DiscoveryFilters>(emptyDiscoveryFilters);
  const [publicQuery, setPublicQuery] = useState('');
  const [mentorId, setMentorId] = useState('');
  const [mentorOrigin, setMentorOrigin] = useState<MentorOrigin>('dashboard');
  const [bookingDraft, setBookingDraft] = useState<BookingDraft | null>(null);
  const [editingRequestId, setEditingRequestId] = useState<string | undefined>();
  const [applicationKey, setApplicationKey] = useState(0);
  const [preferencesOrigin, setPreferencesOrigin] = useState<'dashboard' | 'profile' | 'skills' | 'mentor-account'>('dashboard');
  const photo = useStoredFile(snapshot?.state.profile.photoStorageId, accountService.getPhoto);
  const returnPosition = useRef<{ scrollY: number; mentorId: string; fromAssistant: boolean } | null>(null);
  const restoring = useRef(false);
  const reading = useRef(new Set<string>());
  useEffect(() => {
    const refresh = (event: StorageEvent) => { if (event.key === 'skillswap:frontend-demo:account:v1' || event.key === 'skillswap:frontend-demo:bookings:v1') { setLoadError(false); setAttempt(value => value + 1); } };
    window.addEventListener('storage', refresh); return () => window.removeEventListener('storage', refresh);
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([studentService.getDashboard(), studentService.getBookingDraft()]).then(([next, draft]) => {
      if (!active) return;
      setSnapshot(next);
      if (hasCompletePreferences(next.state.profile) && draft) { setBookingDraft(draft); setMentorId(draft.mentorId); setPage('booking'); }
      else {
        let saved = ''; try { saved = sessionStorage.getItem('skillswap:frontend:page') ?? ''; } catch { /* Navegación en memoria. */ }
        const mentorApproved = false;
        setPage(hasCompletePreferences(next.state.profile) ? (isMentorPage(saved) ? (mentorApproved ? saved : 'skills') : saved === 'sessions' || saved === 'wallet' || saved === 'profile' || saved === 'skills' ? saved : saved === 'mentor-application' ? 'skills' : ['landing', 'public-explore', 'how-it-works', 'share-skills'].includes(saved) ? saved as Page : 'dashboard') : 'profile-setup');
      }
    }, error => { if (active) { setLoadErrorMessage(error instanceof Error ? error.message : 'No pudimos cargar tu panel. Comprueba el servidor local y vuelve a intentarlo.'); setLoadError(true); setPage('profile-setup'); } });
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
    setNotificationSelection(null); setNotificationTargetError(false);
    setPending(null);
    setPage(next);
    try { sessionStorage.setItem('skillswap:frontend:page', next); } catch { /* No afecta datos ni créditos. */ }
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const privateNavigate = (next: StudentDestination) => {
    navigate(next);
  };
  const mentorApproved = false; // El panel mentor se conserva para la segunda etapa.
  const openNotification = (item: NotificationRecord) => {
    if (!snapshot) return;
    const destination = notificationDestination(item, snapshot.state.profile.id, snapshot.state.activity, snapshot.state.account?.requests ?? [], mentorApproved);
    if (destination.type === 'unavailable') { setNotificationTargetError(true); return; }
    if (destination.type === 'page') { navigate(destination.page); return; }
    navigate(destination.type === 'request' ? 'skills' : destination.role === 'mentor' ? 'mentor-sessions' : 'sessions');
    setNotificationSelection({ type: destination.type, id: destination.id, key: ++notificationSequence.current });
  };
  const openMentorMode = (destination: MentorDestination = 'mentor-dashboard') => { setPending(`Panel mentor (${destination}) pendiente de habilitar`); };
  const studentMode = async () => {
    try { const next = await studentService.getDashboard(); setSnapshot(next); navigate(hasCompletePreferences(next.state.profile) ? 'dashboard' : 'profile-setup'); }
    catch (error) { setLoadErrorMessage(error instanceof Error ? error.message : 'No pudimos recuperar tu espacio de estudiante.'); setLoadError(true); }
  };
  const editPreferences = (origin: typeof preferencesOrigin = 'dashboard') => { setPreferencesOrigin(origin); navigate('profile-setup'); };
  const openApplication = (id?: string) => {
    setEditingRequestId(id); setApplicationKey(value => value + 1);
    navigate(snapshot && hasCompletePreferences(snapshot.state.profile) ? 'mentor-application' : 'profile-setup');
  };
  const changedAccount = (account: AccountData) => {
    setSnapshot(current => {
      if (!current) return current;
      const read = new Set(current.state.notifications.filter(item => item.read).map(item => item.id));
      return { ...current, state: { ...current.state, account, profile: { ...current.state.profile, ...account.profile }, skillRequests: account.requests,
        notifications: [...account.notifications.map(item => ({ ...item, read: read.has(item.id) })), ...current.state.notifications.filter(item => !account.notifications.some(next => next.id === item.id))] } };
    });
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
      return { ...current, state: { ...current.state, activity: ledger, wallet: ledger.wallet, sessions: ledger.sessions.filter(item => item.studentId === current.state.profile.id), mentorRatings: ratings, reviews,
        notifications: [...ledger.notifications.map(item => ({ ...item, read: read.has(item.id) })), ...current.state.notifications.filter(item => !ledger.notifications.some(next => next.id === item.id))] } };
    });
    void studentService.getDashboard().then(setSnapshot, error => { setLoadErrorMessage(error instanceof Error ? error.message : 'No se pudo actualizar el panel.'); setLoadError(true); });
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
    onLogout: logout,
  };
  return <>
    {logoutError && <aside role="alert" className="p-4 text-[#B54747]">{logoutError}<Button variant="outline" onClick={logout}>Reintentar cierre</Button></aside>}
    {catalog.error && <aside role="alert" className="p-4 text-[#B54747]">No pudimos actualizar el catálogo.<Button variant="outline" onClick={catalog.retry}>Reintentar catálogo</Button></aside>}
    {notificationTargetError && <aside role="alert" className="p-4 text-[#B54747]">No encontramos la sesión o solicitud de esta notificación disponible para tu cuenta.<Button variant="ghost" onClick={() => setNotificationTargetError(false)}>Entendido</Button></aside>}
    {page === 'loading' && <p role="status" className="p-6">Cargando tu espacio de aprendizaje…</p>}
    {loadError && <aside role="alert" className="border-b border-[#E8C2C2] bg-[#FFF3F0] p-4 text-[#B54747]">{loadErrorMessage} <Button variant="outline" onClick={() => { setLoadError(false); setPage('loading'); setAttempt(current => current + 1); }}>Reintentar</Button></aside>}
    {page === 'profile-setup' && !loadError && <ProfileSetupPage service={profileService} startEditing backLabel={preferencesOrigin === 'profile' || preferencesOrigin === 'mentor-account' ? 'Volver al perfil' : preferencesOrigin === 'skills' ? 'Volver a mis habilidades' : 'Volver al inicio'} onReset={() => setSnapshot(current => current && ({ ...current, state: { ...current.state, profile: { ...current.state.profile, ...emptyPreferences(), serverOnboardingComplete: false } } }))} onBack={() => navigate(snapshot && hasCompletePreferences(snapshot.state.profile) ? preferencesOrigin : 'landing')} onComplete={preferences => {
      // El callback solo se ejecuta después de que ProfileService confirme el guardado.
      setSnapshot(current => current ? { ...current, state: { ...current.state, profile: { ...current.state.profile, ...preferences } } } : null);
      if (snapshot) navigate(preferencesOrigin);
      else { setLoadError(false); setPage('loading'); setAttempt(current => current + 1); }
    }} />}
    {(page === 'dashboard' || page === 'discover' || page === 'explore' || page === 'sessions' || page === 'wallet' || page === 'profile' || page === 'skills' || page === 'mentor-application') && snapshot && <StudentShell active={page === 'mentor-application' ? 'skills' : page} userName={snapshot.state.profile.name} userPhoto={photo.url || snapshot.state.profile.photo} credits={snapshot.state.wallet.available}
      notifications={snapshot.state.notifications.filter(item => item.userId === snapshot.state.profile.id)} onReadNotification={id => void markRead(id)}
      onNavigate={privateNavigate} onPublicHome={() => navigate('landing')} onLogout={logout}
      onOpenNotification={openNotification}
      teachingAction={mentorApproved ? { label: 'Ir al panel de mentor', onClick: () => openMentorMode() } : { label: 'Quiero ser mentor', onClick: () => openApplication() }}>
      {page === 'dashboard' && <StudentDashboardPage state={snapshot.state} mentors={snapshot.mentors} onExplore={() => navigate('explore')}
        onDiscover={() => navigate('discover')} onSessions={() => navigate('sessions')} onWallet={() => navigate('wallet')}
        onMentorRequest={() => openApplication()} onMentorMode={mentorApproved ? () => openMentorMode() : undefined} onMentor={openMentor} onEditPreferences={() => editPreferences()} />}
      {(page === 'discover' || page === 'explore') && <RecommendationsPage key={page} mentors={snapshot.mentors} profile={snapshot.state.profile} ratings={snapshot.state.mentorRatings}
        recommended={page === 'explore'} filters={filters} onFiltersChange={setFilters} onViewMentor={openMentor} onEditPreferences={() => editPreferences()} />}
      {page === 'sessions' && snapshot.state.activity && <SessionsHubPage key={notificationSelection?.key ?? 'list'} initialSessionId={notificationSelection?.type === 'session' ? notificationSelection.id : undefined} ledger={snapshot.state.activity} service={studentService} onChanged={changedActivity} onExplore={() => navigate('discover')} />}
      {page === 'wallet' && snapshot.state.activity && <CreditsHubPage state={snapshot.state.activity} />}
      {page === 'profile' && <ProfilePage profile={snapshot.state.profile} photo={photo} service={accountService} onChanged={changedAccount} onEditPreferences={() => editPreferences('profile')} onLogout={logout} />}
      {page === 'skills' && <SkillsPage key={notificationSelection?.key ?? 'list'} initialRequestId={notificationSelection?.type === 'request' ? notificationSelection.id : undefined} profile={snapshot.state.profile} requests={snapshot.state.account?.requests ?? []} service={accountService} onNew={() => openApplication()} onEdit={openApplication} onEditPreferences={() => editPreferences('skills')} />}
      {page === 'mentor-application' && <MentorApplicationPage key={applicationKey} initialRequest={snapshot.state.account?.requests.find(item => item.id === editingRequestId)} existingRequests={snapshot.state.account?.requests ?? []} service={accountService} onChanged={changedAccount} onBack={() => navigate('skills')} />}
      {(page === 'sessions' || page === 'wallet') && <RecommendationAssistant mentors={snapshot.mentors} profile={snapshot.state.profile} ratings={snapshot.state.mentorRatings} onViewMentor={openMentor} />}
    </StudentShell>}
    {isMentorPage(page) && snapshot && <MentorArea key={attempt} active={Object.entries(mentorPages).find(([, value]) => value === page)![0] as MentorDestination} service={mentorService} studentService={studentService} accountService={accountService}
      profile={snapshot.state.profile} photo={photo} notifications={snapshot.state.notifications} onReadNotification={id => void markRead(id)} onOpenNotification={openNotification} sessionSelection={notificationSelection?.type === 'session' ? notificationSelection : undefined} onNavigate={next => navigate(mentorPages[next])}
      onPublicHome={() => navigate('landing')}
      onStudentMode={() => void studentMode()} onLedger={changedActivity} onAccount={changedAccount} onEditPreferences={() => editPreferences('mentor-account')} onApplication={() => openApplication()} onLogout={logout} />}
    {page === 'mentor' && snapshot && <MentorProfilePage key={mentorId} profile={snapshot.state.profile} mentorId={mentorId} service={studentService}
      onBack={() => { restoring.current = true; navigate(mentorOrigin); }} onBooking={() => void startBooking()} />}
    {page === 'booking' && snapshot && <BookingFlowPage key={mentorId} mentorId={mentorId} draft={bookingDraft} service={studentService} onConfirmed={confirmedBooking}
      onBack={() => void leaveBooking('mentor')} onHome={() => void leaveBooking('dashboard')} onBuyCredits={() => void leaveBooking('wallet')} onSessions={() => void leaveBooking('sessions')} />}
    {page === 'landing' && <LandingPage {...actions} mentors={catalog.mentors} />}
    {page === 'public-explore' && <PublicExplorePage {...actions} mentors={catalog.mentors} searchQuery={publicQuery} onSearchChange={setPublicQuery} onPrivateExplore={() => navigate(snapshot && hasCompletePreferences(snapshot.state.profile) ? 'explore' : 'profile-setup')} onMentor={openMentor} />}
    {page === 'how-it-works' && <HowItWorksPage {...actions} />}
    {page === 'share-skills' && <ShareSkillsPage {...actions} onStartSharing={() => openApplication()} />}
    {(pending || notificationError) && <Modal labelledBy="pending-destination-title" onClose={() => { setPending(null); setNotificationError(false); }}>
      <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="pending-destination-title" className="text-xl font-bold text-[#182B2A]">{notificationError ? 'No pudimos actualizar la notificación' : pending}</h2>
        <p className="mt-3 text-sm text-[#60716C]">{notificationError ? 'La notificación sigue sin leer. Puedes volver a abrirla e intentarlo de nuevo.' : 'Esta opción todavía no está disponible. Podrás acceder a ella en una próxima actualización.'}</p>
        <Button className="mt-5" onClick={() => { setPending(null); setNotificationError(false); }}>Entendido</Button>
      </section>
    </Modal>}
  </>;
}
