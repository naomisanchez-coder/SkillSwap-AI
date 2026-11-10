import { useEffect, useState } from 'react';
import { Button } from './Button';
import { MentorShell, type MentorDestination } from './AppShell';
import { ProfilePage, SkillsPage } from '../pages/AccountMentorPages';
import { MentorDashboardPage, MentorEarningsPage, MentorReviewsPage } from '../pages/MentorPages';
import { MentorAvailabilityPage, MentorOffersPage } from '../pages/MentorSettingsPages';
import SessionsHubPage from '../pages/SessionsHubPage';
import type { MentorService } from '../services/mentor';
import type { StudentService } from '../services/student';
import type { AccountService } from '../services/account';
import type { AccountData } from '../data/account';
import type { UserProfile, NotificationRecord } from '../data/student';
import { sessionMentorOwner, type MentorWorkspace } from '../data/mentor';
import type { BookingLedger } from '../data/booking';
import type { useStoredFile } from '../hooks/useStoredFile';

export function MentorArea({ active, service, studentService, accountService, profile, photo, notifications, onReadNotification, onOpenNotification, sessionSelection, onNavigate, onStudentMode, onPublicHome, onLedger, onAccount, onEditPreferences, onApplication, onLogout }: {
  active: MentorDestination; service: MentorService; studentService: StudentService; accountService: AccountService; profile: UserProfile; photo: ReturnType<typeof useStoredFile>; notifications: NotificationRecord[];
  onReadNotification: (id: string) => void; onOpenNotification: (item: NotificationRecord) => void; sessionSelection?: { id: string; key: number };
  onNavigate: (page: MentorDestination) => void; onStudentMode: () => void; onPublicHome: () => void;
  onLedger: (ledger: BookingLedger) => void; onAccount: (account: AccountData) => void; onEditPreferences: () => void; onApplication: () => void; onLogout: () => void;
}) {
  const [workspace, setWorkspace] = useState<MentorWorkspace | null>(null); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    service.getWorkspace().then(value => { if (current) setWorkspace(value); }, caught => { if (current) setError(caught instanceof Error ? caught.message : 'No pudimos recuperar tus mentorías.'); });
    return () => { current = false; };
  }, [service, attempt]);
  const acceptWorkspace = (next: MentorWorkspace) => { setWorkspace(next); onLedger(next.ledger); };
  const acceptLedger = (ledger: BookingLedger) => {
    setWorkspace(current => {
      if (!current) return current;
      const sessions = ledger.sessions.filter(session => sessionMentorOwner(session) === current.profile.id);
      return { ...current, ledger, sessions, settings: ledger.mentorSettings?.[current.profile.id] ?? current.settings, reviews: ledger.reviews.filter(review => sessions.some(session => session.id === review.sessionId && session.status === 'completed')) };
    });
    onLedger(ledger);
  };
  if (error) return <main className="mx-auto max-w-xl p-6 text-[#182B2A]"><h1 className="text-2xl font-bold">No pudimos abrir tu vista de mentor</h1><p role="alert" className="my-5">{error}</p><div className="flex flex-wrap gap-3"><Button onClick={() => { setError(''); setWorkspace(null); setAttempt(value => value + 1); }}>Reintentar</Button><Button variant="outline" onClick={onStudentMode}>Volver a modo estudiante</Button></div></main>;
  if (!workspace) return <p role="status" className="p-6">Cargando tus mentorías…</p>;
  return <MentorShell active={active} userName={profile.name} userPhoto={photo.url || profile.photo} notifications={notifications.filter(item => item.userId === profile.id && item.target === 'mentor-sessions')} onReadNotification={onReadNotification} onOpenNotification={onOpenNotification} onNavigate={onNavigate} onStudentMode={onStudentMode} onPublicHome={onPublicHome} onLogout={onLogout}>
    {active === 'mentor-dashboard' && <MentorDashboardPage workspace={workspace} onAvailability={() => onNavigate('availability')} onEarnings={() => onNavigate('earnings')} onStudentMode={onStudentMode} />}
    {active === 'offers' && <MentorOffersPage workspace={workspace} service={service} onChanged={acceptWorkspace} onAvailability={() => onNavigate('availability')} />}
    {active === 'availability' && <MentorAvailabilityPage workspace={workspace} service={service} onChanged={acceptWorkspace} onBack={() => onNavigate('mentor-dashboard')} />}
    {active === 'sessions' && <SessionsHubPage key={sessionSelection?.key ?? 'list'} initialSessionId={sessionSelection?.id} ledger={workspace.ledger} service={studentService} mentorAction={service.updateSession} onChanged={acceptLedger} onExplore={() => onNavigate('mentor-dashboard')} />}
    {active === 'earnings' && <MentorEarningsPage workspace={workspace} onBack={() => onNavigate('mentor-dashboard')} />}
    {active === 'reviews' && <MentorReviewsPage workspace={workspace} />}
    {active === 'skills' && <SkillsPage profile={profile} requests={workspace.approved} service={accountService} onNew={onApplication} onEdit={onApplication} onEditPreferences={onEditPreferences} />}
    {active === 'profile' && <ProfilePage profile={profile} photo={photo} service={accountService} onChanged={onAccount} onEditPreferences={onEditPreferences} onLogout={onLogout} />}
  </MentorShell>;
}
