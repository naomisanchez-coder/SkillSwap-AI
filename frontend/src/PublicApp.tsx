import { useEffect, useRef, useState } from 'react'
import LandingPage from './pages/LandingPage'
import PublicExplorePage from './pages/PublicExplorePage'
import HowItWorksPage from './pages/HowItWorksPage'
import ShareSkillsPage from './pages/ShareSkillsPage'
import type { PublicDestination } from './components/PublicChrome'
import { referenceCatalogService, type CatalogService } from './services/catalog'
import { useCatalog } from './hooks/useCatalog'
import RegisterPage from './pages/RegisterPage'
import LoginPage from './pages/LoginPage'
import { useAuthSession } from './hooks/useAuthSession'

export default function PublicApp({ initialPage, catalogService = referenceCatalogService, apiSession = true, onRealAccess }: { initialPage: PublicDestination | 'register' | 'login'; catalogService?: CatalogService; apiSession?: boolean; onRealAccess?: (page: 'login' | 'register') => void }) {
  const [page, setPage] = useState<PublicDestination | 'register' | 'login'>(initialPage)
  const [pendingDestination, setPendingDestination] = useState<string | null>(null)
  const { state: auth, recoverSession, acceptSession, logout, loggingOut, logoutError } = useAuthSession(apiSession)
  const catalog = useCatalog(catalogService)
  const session = auth.status === 'authenticated' ? auth.session : null
  const sessionHeadingRef = useRef<HTMLHeadingElement>(null)
  const logoutErrorRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (session) sessionHeadingRef.current?.focus() }, [session])
  useEffect(() => { if (logoutError) logoutErrorRef.current?.focus() }, [logoutError])

  const navigate = (destination: PublicDestination | 'register' | 'login') => {
    if (loggingOut) return
    if (!apiSession && (destination === 'login' || destination === 'register') && onRealAccess) { onRealAccess(destination); return }
    setPendingDestination(null)
    setPage(destination)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  const closeSession = async () => {
    if (await logout()) {
      setPendingDestination(null); setPage('landing'); history.replaceState(null, '', location.pathname)
      requestAnimationFrame(() => { const heading = document.querySelector('h1'); if (heading) { heading.tabIndex = -1; heading.focus(); } })
    }
  }

  const publicHeaderActions = {
    userName: session?.user.name,
    onNavigate: navigate,
    onLogin: () => navigate('login'),
    onRegister: () => navigate('register'),
    onDashboard: () => setPendingDestination('Panel de estudiante'),
    onLogout: () => { void closeSession() },
  }

  return (
    <>
      {catalog.loading && <p role="status" className="p-3 text-center text-sm">Cargando catálogo…</p>}
      {catalog.error && <aside role="alert" className="p-4 text-[#B54747]">No pudimos recuperar el catálogo.<button type="button" onClick={catalog.retry} className="ml-3 min-h-11 underline">Reintentar catálogo</button></aside>}
      {loggingOut && <p role="status" className="p-3 text-center text-sm">Cerrando sesión…</p>}
      {logoutError && <div ref={logoutErrorRef} tabIndex={-1} role="alert" className="border-b border-[#E8C2C2] bg-[#FFF3F0] p-4 text-[#B54747]"><p>{logoutError}</p><button type="button" disabled={loggingOut} onClick={() => void closeSession()} className="mt-2 min-h-11 rounded-xl border border-current px-4">Reintentar cierre de sesión</button></div>}
      {auth.status === 'checking' && <p role="status" className="bg-[#DDF6ED] p-3 text-center text-sm text-[#176B5B]">Comprobando sesión…</p>}
      {session && (
        <section aria-labelledby="session-state" className="border-b border-[#BFE8D9] bg-[#DDF6ED] px-4 py-5 text-[#17312D]">
          <div className="mx-auto max-w-[1120px]">
            <h2 ref={sessionHeadingRef} tabIndex={-1} id="session-state" className="font-bold">Sesión iniciada · acceso provisional</h2>
            <p className="mt-2 break-words">Hola, {session.user.name}. Tu correo está verificado. Rol: {session.user.role === 'admin' ? 'administrador' : 'estudiante'}.</p>
            <p className="mt-2 text-sm">{session.user.onboardingComplete ? 'Tu perfil está completo.' : 'Tu perfil está pendiente de completar.'} La conexión de los paneles privados y el onboarding sigue pendiente de integración.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" onClick={() => setPendingDestination('Panel privado')} className="min-h-11 rounded-xl bg-[#176B5B] px-4 text-sm font-bold text-white">Mi panel (pendiente)</button>
              <button type="button" disabled={loggingOut} onClick={() => void recoverSession()} className="min-h-11 rounded-xl border border-[#176B5B] px-4 text-sm font-bold">Comprobar sesión</button>
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
        onAuthenticated={next => { acceptSession(next); navigate('landing') }} />}
      {page === 'register' && <RegisterPage onBack={() => navigate('landing')} onLogin={() => navigate('login')} />}
      {page === 'landing' && <LandingPage {...publicHeaderActions} mentors={catalog.mentors} />}
      {page === 'public-explore' && (
        <PublicExplorePage
          {...publicHeaderActions}
          mentors={catalog.mentors}
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
