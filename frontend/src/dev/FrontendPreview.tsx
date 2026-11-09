import { useState } from 'react';
import { Button } from '../components/Button';
import type { PublicDestination } from '../components/PublicChrome';
import { publicMentors } from '../data/publicMentors';
import LandingPage from '../pages/LandingPage';
import PublicExplorePage from '../pages/PublicExplorePage';
import HowItWorksPage from '../pages/HowItWorksPage';
import ShareSkillsPage from '../pages/ShareSkillsPage';
import ProfileSetupPage from '../pages/ProfileSetupPage';
import { mockProfileService } from './profileMock';

/** Aplicación de desarrollo independiente: nunca monta la recuperación de sesión real. */
export default function FrontendPreview({ onRealAccess }: { onRealAccess: (page: 'login' | 'register') => void }) {
  const [page, setPage] = useState<PublicDestination | 'profile-setup'>('profile-setup');
  const [pending, setPending] = useState<string | null>(null);
  const navigate = (next: PublicDestination | 'profile-setup') => {
    setPending(null);
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const actions = {
    userName: 'Mi cuenta',
    onNavigate: navigate,
    onLogin: () => onRealAccess('login'),
    onRegister: () => onRealAccess('register'),
    onDashboard: () => navigate('profile-setup'),
    onLogout: () => setPending('Esta opción estará disponible próximamente.'),
  };
  return <>
    {page === 'profile-setup' && <ProfileSetupPage service={mockProfileService} onBack={() => navigate('landing')} />}
    {page === 'landing' && <LandingPage {...actions} />}
    {page === 'public-explore' && <PublicExplorePage {...actions} mentors={publicMentors} onPrivateExplore={() => setPending('Recomendaciones personalizadas: pendiente de implementación.')} onMentor={() => setPending('Perfil de mentor: pendiente de implementación.')} />}
    {page === 'how-it-works' && <HowItWorksPage {...actions} />}
    {page === 'share-skills' && <ShareSkillsPage {...actions} onStartSharing={() => setPending('Solicitud para compartir una habilidad: pendiente de implementación.')} />}
    {pending && <aside role="status" className="fixed inset-x-4 top-4 z-50 mx-auto max-w-lg rounded-2xl border border-[#C9D8CC] bg-white p-5 shadow-xl"><p>{pending}</p><Button className="mt-3" onClick={() => setPending(null)}>Entendido</Button></aside>}
  </>;
}
