import { useEffect, useRef, useState } from 'react';
import { Avatar, Button } from './ui';
import { Icons } from './icons';
import type { NotificationRecord } from '../data/student';
import { PublicLogo } from './PublicChrome';
import { Modal } from './Modal';

export type StudentDestination =
  | 'dashboard'
  | 'discover'
  | 'explore'
  | 'sessions'
  | 'wallet'
  | 'skills'
  | 'profile';

const items: Array<[StudentDestination, string, typeof Icons.Compass]> = [
  ['dashboard', 'Inicio', Icons.Compass],
  ['discover', 'Explorar', Icons.Search],
  ['explore', 'Para ti', Icons.Zap],
  ['sessions', 'Mis sesiones', Icons.Calendar],
  ['wallet', 'Mis créditos', Icons.Wallet],
  ['skills', 'Mis habilidades', Icons.Award],
  ['profile', 'Mi perfil', Icons.Users],
];

export function StudentShell({
  active,
  userName,
  userPhoto,
  credits,
  notifications,
  onReadNotification,
  onNavigate,
  onPublicHome,
  teachingAction,
  onLogout,
  children,
}: {
  active: StudentDestination;
  userName: string;
  userPhoto?: string;
  credits: number;
  notifications: NotificationRecord[];
  onReadNotification: (id: string) => void;
  onNavigate: (destination: StudentDestination) => void;
  onPublicHome: () => void;
  teachingAction: { label: string; onClick: () => void };
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const notificationButton = useRef<HTMLButtonElement>(null);
  const unread = notifications.filter(item => !item.read).length;
  const viewMeta: Record<StudentDestination, [string, string]> = {
    dashboard: ['Panel del estudiante', 'Tu espacio para aprender y conectar con otros estudiantes.'],
    discover: ['Explorar', 'Navega libremente por habilidades y mentores disponibles.'],
    explore: ['Para ti', 'Recomendaciones basadas en tus intereses y horarios.'],
    sessions: ['Mis sesiones', 'Consulta tus reservas y sesiones anteriores.'],
    wallet: ['Mis créditos', 'Revisa tu saldo académico y el historial de movimientos.'],
    skills: ['Mis habilidades', 'Organiza lo que quieres aprender y enseñar.'],
    profile: ['Mi perfil', 'Actualiza tu información y preferencias de aprendizaje.'],
  };
  const safeDestinations = new Set<StudentDestination>(items.map(([key]) => key));

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!notificationRef.current?.contains(event.target as Node)) setNotificationOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (notificationOpen) { setNotificationOpen(false); notificationButton.current?.focus(); }
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [notificationOpen]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  const sidebar = <>
        <div className="[&_span:first-child]:!text-white mb-8 flex items-center justify-between">
          <PublicLogo />
          <button type="button" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú" className="lg:hidden w-10 h-10 rounded-xl text-white flex items-center justify-center hover:bg-white/10"><Icons.X s={19} /></button>
        </div>
        <nav className="space-y-1" aria-label="Secciones del estudiante">
          {items.map(([key, label, Icon]) => (
            <Button
              key={key}
              aria-current={active === key ? 'page' : undefined}
              variant="ghost"
              full
              icon={<Icon s={18} />}
              onClick={() => {
                onNavigate(key);
                setMobileOpen(false);
              }}
              className={`justify-start !h-11 ${active === key ? '!bg-[#DCEBDD] !text-[#183F3A]' : '!text-[#CFDAD5] hover:!bg-white/10 hover:!text-white'}`}
            >
              {label}
            </Button>
          ))}
        </nav>
        <div className="mt-auto pt-5 border-t border-white/10 space-y-2">
          <Button variant="secondary" full onClick={teachingAction.onClick} icon={<Icons.Repeat s={16} />}>{teachingAction.label}</Button>
          <Button variant="ghost" full onClick={onPublicHome} icon={<Icons.Compass s={16} />} className="justify-start !text-[#CFDAD5] hover:!bg-white/10 hover:!text-white">Ir al Home</Button>
          <div className="flex items-center gap-3 py-3">
            <Avatar name={userName} src={userPhoto} size="lg" status="online" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{userName}</p>
              <p className="text-xs text-[#94A3B8]">Estudiante</p>
            </div>
          </div>
          <Button variant="ghost" full onClick={onLogout} icon={<Icons.LogOut s={16} />} className="justify-start !text-[#CFDAD5] hover:!bg-white/10 hover:!text-white">Cerrar sesión</Button>
        </div>
  </>;

  return (
    <div className="public-page min-h-screen bg-[#F7F7F2] lg:pl-[272px]">
      <aside aria-label="Navegación del estudiante" className="fixed inset-y-0 left-0 z-40 hidden w-[272px] flex-col overflow-y-auto bg-[#182B2A] p-5 lg:flex">{sidebar}</aside>
      {mobileOpen && <Modal labelledBy="student-menu-title" onClose={() => setMobileOpen(false)}>
        <aside id="student-mobile-navigation" aria-label="Navegación del estudiante" className="fixed inset-y-0 left-0 flex w-[min(272px,calc(100vw-24px))] flex-col overflow-y-auto bg-[#182B2A] p-5">
          <h2 id="student-menu-title" className="sr-only">Menú del estudiante</h2>{sidebar}
        </aside>
      </Modal>}

      <header className="sticky top-0 z-20 min-h-[76px] bg-white/95 backdrop-blur border-b border-[#E2E8E0] px-4 md:px-8 py-3 flex items-center gap-3">
        <button type="button" className="lg:hidden h-11 w-11 shrink-0 rounded-xl flex items-center justify-center text-[#182B2A] hover:bg-[#F0F3ED]" onClick={() => setMobileOpen(true)} aria-label="Abrir menú" aria-expanded={mobileOpen} aria-controls="student-mobile-navigation"><Icons.Menu s={20} /></button>
        <div className="min-w-0">
          <p className="font-bold text-[#182B2A] truncate">{viewMeta[active][0]}</p>
          <p className="hidden md:block text-xs text-[#60716C] mt-0.5 truncate">{viewMeta[active][1]}</p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <button type="button" onClick={() => onNavigate('wallet')} className="h-10 px-3 rounded-full bg-[#F2E8D7] text-[#493D29] text-sm font-bold inline-flex items-center gap-1.5 hover:bg-[#EADCC3]"><Icons.Coin s={14} /> {credits}<span className="hidden sm:inline"> créditos</span></button>
        <div className="relative" ref={notificationRef}>
          <Button
            ref={notificationButton}
            aria-expanded={notificationOpen}
            aria-controls="student-notifications"
            variant="ghost"
            onClick={() => setNotificationOpen(value => !value)}
            icon={<Icons.Bell s={18} />}
            className="relative !h-10 !w-10 !p-0"
          >
            <span className="sr-only">Notificaciones{unread ? `, ${unread} sin leer` : ''}</span>
            {unread > 0 && <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-[#B54747] text-white text-[10px] font-bold flex items-center justify-center">{unread}</span>}
          </Button>
          {notificationOpen && (
            <div id="student-notifications" className="fixed left-4 right-4 top-[76px] max-h-[calc(100dvh-92px)] overflow-y-auto rounded-2xl border border-[#E2E8F0] bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-[min(360px,calc(100vw-32px))]">
              <div className="p-4 border-b border-[#E2E8F0]">
                <p className="font-bold text-[#111827]">Notificaciones</p>
                <p className="text-xs text-[#64748B] mt-1">Actualizaciones de tu actividad.</p>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="p-5 text-sm text-[#64748B]">No tienes notificaciones.</p>
                ) : notifications.map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      onReadNotification(item.id);
                      const target = item.target as StudentDestination;
                      onNavigate(safeDestinations.has(target) ? target : 'dashboard');
                      setNotificationOpen(false);
                    }}
                    className={`w-full text-left p-4 border-b border-[#EEF1EC] hover:bg-[#F7F7F2] ${item.read ? '' : 'bg-[#EEF5EF]'}`}
                  >
                    <p className="text-sm font-semibold text-[#111827]">{item.title}</p>
                    <p className="text-xs text-[#64748B] mt-1">{item.description}</p>
                    <p className="text-[11px] text-[#94A3B8] mt-2">{item.date}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
          <button type="button" onClick={() => onNavigate('profile')} aria-label="Abrir mi perfil" className="rounded-full focus-visible:outline-[#24685F]"><Avatar name={userName} src={userPhoto} size="md" /></button>
        </div>
      </header>

      {children}
    </div>
  );
}
