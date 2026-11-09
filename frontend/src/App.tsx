import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import LandingPage from './pages/LandingPage'
import PublicExplorePage from './pages/PublicExplorePage'
import HowItWorksPage from './pages/HowItWorksPage'
import ShareSkillsPage from './pages/ShareSkillsPage'
import type { PublicDestination } from './components/PublicChrome'
import { publicMentors } from './data/publicMentors'
import RegisterPage from './pages/RegisterPage'
import LoginPage from './pages/LoginPage'
import { useAuthSession } from './hooks/useAuthSession'

const DevelopmentPreview = import.meta.env.DEV ? lazy(() => import('./dev/FrontendPreview')) : null
const previewEnabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_FRONTEND_PREVIEW === 'true'

export default function App() {
  const [preview, setPreview] = useState(previewEnabled)
  const [realPage, setRealPage] = useState<'login' | 'register'>('login')
  if (preview && DevelopmentPreview) return <Suspense fallback={<p role="status">Cargando…</p>}>
    <DevelopmentPreview onRealAccess={next => { setRealPage(next); setPreview(false) }} />
  </Suspense>
  return <RealApp initialPage={previewEnabled ? realPage : 'landing'} />
}

function RealApp({ initialPage }: { initialPage: PublicDestination | 'register' | 'login' }) {
  const [page, setPage] = useState<PublicDestination | 'register' | 'login'>(initialPage)
  const [pendingDestination, setPendingDestination] = useState<string | null>(null)
  const { state: auth, recoverSession, acceptSession } = useAuthSession()
  const session = auth.status === 'authenticated' ? auth.session : null
  const sessionHeadingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (session) sessionHeadingRef.current?.focus() }, [session])

  const navigate = (destination: PublicDestination | 'register' | 'login') => {
    setPendingDestination(null)
    setPage(destination)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const publicHeaderActions = {
    userName: session?.user.name,
    onNavigate: navigate,
    onLogin: () => navigate('login'),
    onRegister: () => navigate('register'),
    onDashboard: () => setPendingDestination('Panel de estudiante'),
    onLogout: () => setPendingDestination('Cerrar sesión'),
  }

  return (
    <>
      {auth.status === 'checking' && <p role="status" className="bg-[#DDF6ED] p-3 text-center text-sm text-[#176B5B]">Comprobando sesión…</p>}
      {session && (
        <section aria-labelledby="session-state" className="border-b border-[#BFE8D9] bg-[#DDF6ED] px-4 py-5 text-[#17312D]">
          <div className="mx-auto max-w-[1120px]">
            <h2 ref={sessionHeadingRef} tabIndex={-1} id="session-state" className="font-bold">Sesión iniciada · acceso provisional</h2>
            <p className="mt-2 break-words">Hola, {session.user.name}. Tu correo está verificado. Rol: {session.user.role === 'admin' ? 'administrador' : 'estudiante'}.</p>
            <p className="mt-2 text-sm">{session.user.onboardingComplete ? 'Tu perfil está completo.' : 'Tu perfil está pendiente de completar.'} Los paneles privados, el onboarding y cerrar sesión siguen pendientes de implementación.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" onClick={() => setPendingDestination('Panel privado')} className="min-h-11 rounded-xl bg-[#176B5B] px-4 text-sm font-bold text-white">Mi panel (pendiente)</button>
              <button type="button" onClick={() => void recoverSession()} className="min-h-11 rounded-xl border border-[#176B5B] px-4 text-sm font-bold">Comprobar sesión</button>
            </div>
          </div>
        </section>
      )}
      {(auth.status === 'unavailable' || (auth.status === 'anonymous' && auth.message)) && (
        <aside role="alert" className="border-b border-[#E8C2C2] bg-[#FFF3F0] p-4 text-[#B54747]">
          <div className="mx-auto max-w-[1120px]">
            <p>{auth.message}</p>
            <button type="button" onClick={() => void recoverSession()} className="mt-2 min-h-11 rounded-xl border border-current px-4 text-sm font-bold">Volver a comprobar sesión</button>
          </div>
        </aside>
      )}
      {page === 'login' && <LoginPage onBack={() => navigate('landing')} onRegister={() => navigate('register')}
        onRecoveryPending={() => setPendingDestination('Recuperación de contraseña')}
        onAuthenticated={next => { acceptSession(next); navigate('landing') }} />}
      {page === 'register' && <RegisterPage onBack={() => navigate('landing')} onLogin={() => navigate('login')} />}
      {page === 'landing' && <LandingPage {...publicHeaderActions} />}
      {page === 'public-explore' && (
        <PublicExplorePage
          {...publicHeaderActions}
          mentors={publicMentors}
          onPrivateExplore={() => setPendingDestination('Recomendaciones personalizadas')}
          onMentor={() => setPendingDestination('Perfil de mentor')}
        />
      )}
      {page === 'how-it-works' && <HowItWorksPage {...publicHeaderActions} />}
      {page === 'share-skills' && (
        <ShareSkillsPage
          {...publicHeaderActions}
          onStartSharing={() => setPendingDestination('Solicitud para compartir una habilidad')}
        />
      )}
      {pendingDestination && (
        <aside className="fixed top-20 left-4 right-4 z-50 mx-auto max-w-lg rounded-2xl border border-[#BFE8D9] bg-white p-4 text-[#17312D] shadow-xl">
          <div role="status" aria-live="polite">
            <p className="font-bold">{pendingDestination}: pendiente de implementación</p>
            <p className="mt-1 text-sm text-[#64748B]">Esta funcionalidad se habilitará en una próxima etapa. Por ahora puedes recorrer las páginas públicas.</p>
          </div>
          <button type="button" onClick={() => setPendingDestination(null)} className="mt-3 min-h-11 rounded-xl bg-[#176B5B] px-4 text-sm font-bold text-white hover:bg-[#14594C]">Entendido</button>
        </aside>
      )}
    </>
  )
}
