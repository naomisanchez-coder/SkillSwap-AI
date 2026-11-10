import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card } from '../components/ui';
import { PublicLogo } from '../components/PublicChrome';
import { Modal as NativeModal } from '../components/Modal';
import { Icons } from '../components/icons';
import type { MentorSkillRequest } from '../data/account';
import type { ConfirmedBooking } from '../data/booking';
import { adminIdentity, type AdminSnapshot, type AdminUser } from '../data/admin';
import { adminView, type AdminViewState } from '../data/adminView';
import { formatSessionSchedule } from '../data/scheduling';
import { useStoredFile } from '../hooks/useStoredFile';
import type { AdminService } from '../services/admin';
import { MeetingLink } from '../components/MeetingLink';

type Section = 'summary' | 'requests' | 'users' | 'sessions' | 'incidents' | 'credits' | 'account';
const navigation: Array<[Section, string, typeof Icons.Compass]> = [['summary','Resumen',Icons.Compass],['requests','Solicitudes de mentor',Icons.Award],['users','Usuarios',Icons.Users],['sessions','Sesiones',Icons.Calendar],['incidents','Incidencias',Icons.Shield],['credits','Créditos académicos',Icons.Coin],['account','Mi cuenta',Icons.Users]];
const OperationContext = createContext({ busy: false, error: '', getEvidence: null as unknown as AdminService['getEvidence'] });
export default function AdminOperationsPage({ snapshot, service, onChanged, onLogout }: { snapshot: AdminSnapshot; service: AdminService; onChanged: (snapshot: AdminSnapshot) => void; onLogout: () => void }) {
  const [section, setSection] = useState<Section>(() => { try { const value = sessionStorage.getItem('skillswap:frontend:admin-section'); return navigation.some(([key]) => key === value) ? value as Section : 'summary'; } catch { return 'summary'; } });
  const [mobileOpen,setMobileOpen] = useState(false); const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const inFlight=useRef(false); const heading=useRef<HTMLDivElement>(null);
  const state=useMemo(()=>adminView(snapshot),[snapshot]); const users=snapshot.users;
  useEffect(()=>{ heading.current?.querySelector<HTMLHeadingElement>('h1')?.focus(); },[section]);
  useEffect(()=>{ const query=matchMedia('(min-width: 1024px)'); const close=()=>{if(query.matches)setMobileOpen(false);};query.addEventListener('change',close);return()=>query.removeEventListener('change',close); },[]);
  const navigate=(next:Section)=>{setSection(next);setMobileOpen(false);setError('');try{sessionStorage.setItem('skillswap:frontend:admin-section',next);}catch{/* Navegación en memoria. */}window.scrollTo({top:0,behavior:'instant'});};
  const run=async(action:()=>Promise<void>)=>{if(inFlight.current)return false;inFlight.current=true;setBusy(true);setError('');try{await action();onChanged(await service.getSnapshot());return true;}catch(caught){setError(caught instanceof Error?caught.message:'No pudimos guardar la decisión. Actualiza para comprobar su estado.');return false;}finally{inFlight.current=false;setBusy(false);}};
  const sidebar=<><div className="[&_span:first-child]:!text-white flex items-center justify-between"><PublicLogo/><button type="button" aria-label="Cerrar menú" onClick={()=>setMobileOpen(false)} className="lg:hidden min-h-11 min-w-11 text-white"><Icons.X/></button></div><div className="mt-4"><Badge variant="success">Supervisión académica</Badge></div><nav aria-label="Secciones de administración" className="mt-7 space-y-1">{navigation.map(([key,label,Icon])=><Button disabled={busy} key={key} full variant="ghost" aria-current={section===key?'page':undefined} icon={<Icon s={18}/>} onClick={()=>navigate(key)} className={`justify-start !h-11 ${section===key?'!bg-[#DCEBDD] !text-[#183F3A]':'!text-[#CFDAD5] hover:!bg-white/10'}`}>{label}</Button>)}</nav><div className="mt-auto pt-5 border-t border-white/10"><p className="text-sm font-semibold text-white">{adminIdentity.name}</p><p className="mt-1 text-xs text-[#94A3B8]">Administrador</p><Button disabled={busy} full variant="ghost" className="mt-3 justify-start !text-[#CFDAD5]" onClick={onLogout} icon={<Icons.LogOut s={16}/>}>Cerrar sesión</Button></div></>;
  return <OperationContext.Provider value={{busy,error,getEvidence:service.getEvidence}}><div className="min-h-screen bg-[#F7F7F2] text-[#182B2A] lg:pl-[272px]"><aside className="hidden fixed inset-y-0 left-0 z-40 w-[272px] lg:flex flex-col overflow-y-auto bg-[#182B2A] p-5">{sidebar}</aside>{mobileOpen&&<NativeModal labelledBy="admin-menu-title" onClose={()=>setMobileOpen(false)}><aside className="fixed inset-y-0 left-0 flex w-[min(272px,calc(100vw-24px))] flex-col overflow-y-auto bg-[#182B2A] p-5"><h2 id="admin-menu-title" className="sr-only">Menú de administración</h2>{sidebar}</aside></NativeModal>}<header className="sticky top-0 z-20 min-h-[76px] bg-white/95 backdrop-blur border-b border-[#E2E8E0] px-4 md:px-8 py-3 flex items-center gap-3"><Button variant="ghost" className="lg:hidden !w-10 !p-0" aria-expanded={mobileOpen} onClick={()=>setMobileOpen(true)} icon={<Icons.Menu s={20}/>}><span className="sr-only">Abrir menú</span></Button><div className="min-w-0"><p className="font-bold truncate">{navigation.find(([key])=>key===section)?.[1]}</p><p className="hidden sm:block mt-0.5 text-xs text-[#60716C]">Gestión académica de SkillSwap AI</p></div><div className="ml-auto"><Badge variant="primary">Administrador</Badge></div></header><main ref={heading} className="p-4 md:p-8"><div className="max-w-[1240px] mx-auto">{error&&<div className="mb-4"><p role="alert" className="text-[#B54747]">{error}</p><Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{})}>Actualizar datos</Button></div>}<fieldset disabled={busy} className="min-w-0">
  {section==='summary'&&<Summary state={state} users={users} onNavigate={navigate}/>}
  {section==='requests'&&<MentorRequests state={state} users={users} onSkillStatus={(id,status,comment)=>run(()=>{const request=state.skillRequests.find(item=>item.id===id)!;return service.decideSkill({id,submissionId:request.submissionId,decisionId:crypto.randomUUID(),status:status as 'approved'|'rejected',comment:comment??''});})}/>}
  {section==='users'&&<Users state={state} users={users} onToggleAccount={id=>run(()=>service.updateActivity({type:'suspension',userId:id,suspended:!state.suspendedUserIds.includes(id)}))}/>}
  {section==='sessions'&&<Sessions state={state}/>}
  {section==='incidents'&&<Incidents state={state} onReview={id=>run(()=>service.updateActivity({type:'review',id}))} onResolve={(id,resolution,comment)=>run(()=>service.updateActivity({type:'resolve',id,resolution,comment}))}/>}
  {section==='credits'&&<Credits state={state}/>}
  {section==='account'&&<Account state={state}/>}</fieldset></div></main></div></OperationContext.Provider>;
}

function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <section className="rounded-[24px] bg-[#DCEBDD] border border-[#C9D8CC] p-7 md:p-9">
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#24685F]">{eyebrow}</p>
      <h1 tabIndex={-1} className="mt-2 text-3xl md:text-4xl font-extrabold">{title}</h1>
      <p className="mt-3 max-w-3xl text-[#52645F]">{description}</p>
    </section>
  );
}

function Summary({ state, users, onNavigate }: { state: AdminViewState; users: AdminUser[]; onNavigate: (section: Section) => void }) {
  const pending = state.skillRequests.filter(request => request.status === 'pending').length;
  const openIncidents = state.incidents.filter(incident => ['open', 'in_review'].includes(incident.status)).length;
  const metrics = [
    ['Estudiantes registrados', users.length],
    ['Mentores habilitados', users.filter(user => user.approvedSkills?.length || state.skillRequests.some(request => request.ownerUserId === user.id && request.status === 'approved')).length],
    ['Solicitudes pendientes', pending],
    ['Sesiones programadas', state.sessions.filter(session => ['upcoming', 'active', 'validation'].includes(session.status)).length],
    ['Sesiones completadas', state.sessions.filter(session => session.status === 'completed').length],
    ['Incidencias abiertas', openIncidents],
  ];
  return (
    <>
      <PageIntro eyebrow="Vista general" title="Resumen académico" description="Indicadores calculados únicamente a partir de las cuentas y actividades registradas en la plataforma." />
      <section className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-7">
        {metrics.map(([label, value]) => <Card key={String(label)} className="p-5"><p className="text-3xl font-extrabold text-[#24685F]">{value}</p><p className="mt-1 text-sm text-[#64748B]">{label}</p></Card>)}
      </section>
      <div className="grid md:grid-cols-2 gap-5 mt-6">
        <Card className="p-6"><Icons.Award s={23} c="text-[#24685F]" /><h2 className="mt-4 text-xl font-bold">Solicitudes pendientes</h2><p className="mt-2 text-sm text-[#64748B]">{pending ? `${pending} solicitudes requieren una decisión administrativa.` : 'No hay solicitudes pendientes.'}</p><Button className="mt-5" onClick={() => onNavigate('requests')}>Ir a solicitudes</Button></Card>
        <Card className="p-6"><Icons.Shield s={23} c="text-[#24685F]" /><h2 className="mt-4 text-xl font-bold">Incidencias por revisar</h2><p className="mt-2 text-sm text-[#64748B]">{openIncidents ? `${openIncidents} incidencias están abiertas o en revisión.` : 'No hay incidencias abiertas.'}</p><Button className="mt-5" variant="outline" onClick={() => onNavigate('incidents')}>Ir a incidencias</Button></Card>
      </div>
    </>
  );
}

function MentorRequests({ state, users, onSkillStatus }: { state: AdminViewState; users: AdminUser[]; onSkillStatus: (id: string, status: MentorSkillRequest['status'], comment?: string) => Promise<boolean> }) {
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);
  const [comment, setComment] = useState('');
  const visible = state.skillRequests.filter(request => filter === 'all' || request.status === filter);
  const request = state.skillRequests.find(item => item.id === selectedId);
  const student = request ? users.find(user => user.id === request.ownerUserId) : undefined;
  const history = request ? state.skillRequests.filter(item => item.ownerUserId === request.ownerUserId) : [];
  const close = () => { setSelectedId(null); setDecision(null); setComment(''); };
  const applyDecision = async () => {
    if (!request || !decision || (decision === 'rejected' && !comment.trim())) return;
    if (await onSkillStatus(request.id, decision, decision === 'rejected' ? comment.trim() : undefined)) close();
  };
  return (
    <>
      <PageIntro eyebrow="Validación de habilidades" title="Solicitudes de mentor" description="Revisa la evidencia declarada y habilita únicamente la habilidad específica aprobada." />
      <Filters value={filter} onChange={setFilter} options={[['all','Todas'],['pending','Pendientes'],['approved','Aprobadas'],['rejected','Rechazadas'],['observation','En observación']]} />
      {visible.length === 0 ? <Empty title="No hay solicitudes en este estado" description="Las nuevas solicitudes aparecerán aquí para revisión." /> : (
        <Table headers={['Estudiante','Habilidad','Nivel','Fecha','Estado','Acción']}>
          {visible.map(item => <tr key={item.id} className="border-t border-[#E2E8E0]"><td className="p-4 font-semibold">{item.userName}</td><td className="p-4">{item.skill}</td><td className="p-4">{item.level}</td><td className="p-4 whitespace-nowrap">{item.requestedAt}</td><td className="p-4"><StatusBadge status={item.status} /></td><td className="p-4"><Button size="sm" variant="outline" onClick={() => setSelectedId(item.id)}>Revisar</Button></td></tr>)}
        </Table>
      )}
      {request && (
        <Modal title={`Solicitud · ${request.skill}`} description={request.id} onClose={close}>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <Detail label="Estudiante" value={request.userName} />
            <Detail label="Carrera y ciclo" value={`${student?.career || 'No registrada'} · ${student?.cycle ? `${student.cycle}.º ciclo` : 'Ciclo no registrado'}`} />
            <Detail label="Nivel" value={request.level} />
            <Detail label="Fecha" value={request.requestedAt} />
            <Detail label="Experiencia" value={request.experience} wide />
            <Detail label="Temas que desea enseñar" value={request.topics} wide />
            <Detail label="Evidencia declarada" value={request.evidenceName} />
            <Detail label="Portafolio" value={request.portfolio || 'No proporcionado'} />
          </div>
          <MentorEvidence key={`${request.id}:${request.evidenceStorageId || 'legacy'}`} request={request} />
          <div className="mt-5 border-t border-[#E2E8E0] pt-5"><p className="font-bold">Historial de solicitudes y decisiones</p><div className="mt-3 space-y-2">{history.map(item => <div key={item.id} className="rounded-xl bg-[#F7F7F2] p-3 text-sm"><div className="flex flex-wrap justify-between gap-3"><span>{item.skill} · {item.requestedAt}</span><StatusBadge status={item.status} /></div><ol className="mt-3 space-y-3">{item.history.map(event => <li key={event.id}><StatusBadge status={event.status}/><time className="ml-2 text-xs text-[#64748B]" dateTime={event.at}>{new Date(event.at).toLocaleString('es-PE',{timeZone:'America/Lima'})}</time>{event.comment&&<p className="mt-1 whitespace-pre-wrap break-words">{event.comment}</p>}</li>)}</ol></div>)}</div></div>
          {request.status === 'pending' && <div className="mt-6 flex flex-wrap gap-2"><Button onClick={() => setDecision('approved')}>Aprobar habilidad</Button><Button variant="danger" onClick={() => setDecision('rejected')}>Rechazar</Button></div>}
          {decision && request.status === 'pending' && (
            <div className="mt-5 rounded-xl border border-[#CBD8CE] p-4">
              <p className="font-bold">{decision === 'approved' ? 'Confirmar aprobación' : 'Confirmar rechazo'}</p>
              <p className="mt-1 text-sm text-[#64748B]">{decision === 'approved' ? 'Esta habilidad quedará disponible para crear ofertas; si es la primera, se habilitará el modo mentor.' : 'El estudiante podrá corregir y reenviar la solicitud.'}</p>
              {decision === 'rejected' && <textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} required aria-label="Observación obligatoria" rows={3} placeholder="Observación obligatoria" className="mt-3 w-full rounded-xl border border-[#CBD8CE] p-3 text-sm" />}
              <div className="mt-3 flex gap-2"><Button disabled={decision === 'rejected' && !comment.trim()} onClick={() => void applyDecision()}>Confirmar</Button><Button variant="ghost" onClick={() => { setDecision(null); setComment(''); }}>Volver</Button></div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

function MentorEvidence({ request }: { request: MentorSkillRequest }) {
  const { getEvidence } = useContext(OperationContext);
  const file = useStoredFile(request.evidenceStorageId, getEvidence);
  return <section className="mt-5 rounded-xl border border-[#E2E8E0] p-4"><p className="font-bold">Documento de evidencia</p><p className="mt-2 text-sm break-words">{request.evidenceName}</p><p className="mt-2 text-xs leading-5 text-[#6B5836]">El PDF se conserva en este navegador y origen.</p>{file.loading && <p role="status">Recuperando PDF…</p>}{(file.error || !request.evidenceStorageId) && <div className="mt-3"><p role="alert" className="text-sm text-[#B54747]">{file.error || 'Esta solicitud conserva solo el nombre. Solicita que se adjunte nuevamente el PDF.'}</p><Button size="sm" variant="outline" onClick={file.retry}>Reintentar recuperar PDF</Button></div>}{file.url && <a href={file.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-[#24685F] underline">Abrir PDF en otra pestaña</a>}</section>;
}

function Users({ state, users, onToggleAccount }: { state: AdminViewState; users: AdminUser[]; onToggleAccount: (id: string) => Promise<boolean> }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const visible = users.filter(user => {
    const suspended = state.suspendedUserIds.includes(user.id);
    return (filter === 'all' || (filter === 'verified' && user.verified) || (filter === 'mentor' && (user.approvedSkills?.length || state.skillRequests.some(request => request.ownerUserId === user.id && request.status === 'approved'))) || (filter === 'suspended' && suspended))
      && `${user.name} ${user.email} ${user.career}`.toLowerCase().includes(query.toLowerCase());
  });
  const selected = users.find(user => user.id === selectedId);
  const confirmed = users.find(user => user.id === confirmId);
  const approvedSkills = (userId: string) => [...new Set([...(users.find(user => user.id === userId)?.approvedSkills ?? []), ...state.skillRequests.filter(request => request.ownerUserId === userId && request.status === 'approved').map(request => request.skill)])];
  return (
    <>
      <PageIntro eyebrow="Comunidad" title="Usuarios" description="Consulta datos académicos esenciales y el estado de acceso de las cuentas registradas." />
      <div className="mt-6 flex flex-col md:flex-row gap-3"><input value={query} onChange={event => setQuery(event.target.value)} aria-label="Buscar por nombre, correo o carrera" placeholder="Buscar por nombre, correo o carrera" className="h-11 flex-1 rounded-xl border border-[#CBD8CE] bg-white px-4 text-sm" /><Filters compact value={filter} onChange={setFilter} options={[['all','Todos'],['verified','Verificados'],['mentor','Mentores'],['suspended','Suspendidos']]} /></div>
      {visible.length === 0 ? <Empty title="No se encontraron usuarios" description="Ajusta la búsqueda o los filtros." /> : <Table headers={['Nombre','Correo institucional','Carrera','Verificación','Cuenta','Mentor','Acción']}>{visible.map(user => {
        const suspended = state.suspendedUserIds.includes(user.id);
        const skills = approvedSkills(user.id);
        return <tr key={user.id} className="border-t border-[#E2E8E0]"><td className="p-4 font-semibold">{user.name}<p className="text-xs font-normal text-[#64748B]">{user.cycle ? `${user.cycle}.º ciclo` : 'Ciclo pendiente'}</p></td><td className="p-4">{user.email}</td><td className="p-4">{user.career || 'Pendiente'}</td><td className="p-4"><Badge variant={user.verified ? 'success' : 'warning'}>{user.verified ? 'Verificada' : 'Pendiente'}</Badge></td><td className="p-4"><Badge variant={suspended ? 'danger' : 'success'}>{suspended ? 'Suspendida' : 'Activa'}</Badge></td><td className="p-4">{skills.length ? `Sí · ${skills.length}` : 'No'}</td><td className="p-4"><Button size="sm" variant="outline" onClick={() => setSelectedId(user.id)}>Detalle</Button></td></tr>;
      })}</Table>}
      {selected && !confirmed && <Modal title={selected.name} description={selected.email} onClose={() => setSelectedId(null)}><div className="grid sm:grid-cols-2 gap-4 text-sm"><Detail label="Carrera" value={selected.career || 'No registrada'} /><Detail label="Ciclo" value={selected.cycle ? `${selected.cycle}.º` : 'No registrado'} /><Detail label="Verificación" value={selected.verified ? 'Cuenta verificada' : 'Verificación pendiente'} /><Detail label="Condición mentor" value={approvedSkills(selected.id).length ? 'Mentor habilitado' : 'Solo estudiante'} /><Detail label="Habilidades aprobadas" value={approvedSkills(selected.id).join(', ') || 'Ninguna'} wide />{state.wallets[selected.id] && <><Detail label="Saldo disponible" value={String(state.wallets[selected.id].available)} /><Detail label="Créditos retenidos" value={String(state.wallets[selected.id].held)} /><Detail label="Créditos utilizados" value={String(state.wallets[selected.id].used)} /><Detail label="Créditos obtenidos" value={String(state.wallets[selected.id].earned)} /></>}</div><Button className="mt-6" variant={state.suspendedUserIds.includes(selected.id) ? 'secondary' : 'danger'} onClick={() => setConfirmId(selected.id)}>{state.suspendedUserIds.includes(selected.id) ? 'Reactivar cuenta' : 'Suspender cuenta'}</Button><p className="mt-3 text-xs text-[#64748B]">El administrador no puede consultar ni modificar contraseñas.</p></Modal>}
      {confirmed && <Modal title={state.suspendedUserIds.includes(confirmed.id) ? '¿Reactivar esta cuenta?' : '¿Suspender esta cuenta?'} description={confirmed.name} onClose={() => setConfirmId(null)}><p className="text-sm text-[#60716C]">La acción quedará registrada en la auditoría administrativa.</p><div className="mt-5 flex gap-2"><Button variant={state.suspendedUserIds.includes(confirmed.id) ? 'secondary' : 'danger'} onClick={() => void onToggleAccount(confirmed.id).then(saved => { if (saved) { setConfirmId(null); setSelectedId(null); } })}>Confirmar</Button><Button variant="outline" onClick={() => setConfirmId(null)}>Cancelar</Button></div></Modal>}
    </>
  );
}

function Sessions({ state }: { state: AdminViewState }) {
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visible = state.sessions.filter(session => filter === 'all' || session.status === filter);
  const session = state.sessions.find(item => item.id === selectedId);
  return (
    <>
      <PageIntro eyebrow="Seguimiento" title="Sesiones" description="Consulta reservas, estados, enlaces e incidencias sin alterar sesiones completadas ni movimientos históricos." />
      <Filters value={filter} onChange={setFilter} options={[['all','Todas'],['upcoming','Programadas'],['active','En curso'],['validation','Por validar'],['completed','Completadas'],['review','Con incidencia'],['cancelled','Canceladas']]} />
      {visible.length === 0 ? <Empty title="No hay sesiones en este estado" description="Las reservas aparecerán cuando exista actividad." /> : <Table headers={['ID','Mentor','Estudiante','Habilidad','Fecha','Duración','Estado','Créditos','Enlace']}>{visible.map(item => <tr key={item.id} className="border-t border-[#E2E8E0]"><td className="p-4 font-mono text-xs"><Button size="sm" variant="outline" onClick={() => setSelectedId(item.id)} aria-label={`Ver sesión ${item.id}`}>{item.id}</Button></td><td className="p-4">{item.mentorName}</td><td className="p-4">{item.learnerName}</td><td className="p-4">{item.skill}</td><td className="p-4 whitespace-nowrap">{formatSessionSchedule(item.date,item.time)}</td><td className="p-4">{item.duration} min</td><td className="p-4"><StatusBadge status={item.status} /></td><td className="p-4">{item.credits}</td><td className="p-4 max-w-xs"><MeetingLink session={item} /></td></tr>)}</Table>}
      {session && <SessionDetail session={session} incident={state.incidents.find(incident => incident.sessionId === session.id)} onClose={() => setSelectedId(null)} />}
    </>
  );
}

function Incidents({ state, onReview, onResolve }: { state: AdminViewState; onReview: (id: string) => Promise<boolean>; onResolve: (id: string, resolution: 'refund' | 'release' | 'no_adjustment', comment: string) => Promise<boolean> }) {
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<'refund' | 'release' | 'no_adjustment'>('no_adjustment');
  const [comment, setComment] = useState('');
  const visible = state.incidents.filter(incident => filter === 'all' || incident.status === filter);
  const incident = state.incidents.find(item => item.id === selectedId);
  const session = incident ? state.sessions.find(item => item.id === incident.sessionId) : undefined;
  const close = () => { setSelectedId(null); setResolution('no_adjustment'); setComment(''); };
  return (
    <>
      <PageIntro eyebrow="Resolución académica" title="Incidencias" description="Revisa problemas reportados, documenta una decisión y evita ajustes duplicados de créditos." />
      <Filters value={filter} onChange={setFilter} options={[['all','Todas'],['open','Abiertas'],['in_review','En revisión'],['resolved','Resueltas'],['closed','Cerradas sin ajuste']]} />
      {visible.length === 0 ? <Empty title="No hay incidencias en este estado" description="Los reportes de estudiantes y mentores aparecerán aquí." /> : <Table headers={['ID','Sesión','Reportado por','Motivo','Estado','Acción']}>{visible.map(item => <tr key={item.id} className="border-t border-[#E2E8E0]"><td className="p-4 font-mono text-xs">{item.id}</td><td className="p-4">{item.sessionId}</td><td className="p-4">{item.reporterName}</td><td className="p-4 max-w-xs truncate">{item.reason}</td><td className="p-4"><StatusBadge status={item.status} /></td><td className="p-4"><Button size="sm" variant="outline" onClick={() => setSelectedId(item.id)}>Consultar</Button></td></tr>)}</Table>}
      {incident && <Modal title={`Incidencia ${incident.id}`} description={`Sesión ${incident.sessionId}`} onClose={close}><div className="space-y-4 text-sm"><Detail label="Reportado por" value={`${incident.reporterName} · ${incident.reporterRole === 'student' ? 'Estudiante' : 'Mentor'}`} /><Detail label="Tipo de problema" value={incidentCategoryLabel(incident.category)} /><Detail label="Evidencia y observaciones" value={incident.reason} /><Detail label="Estado" value={incident.status === 'open' ? 'Abierta' : incident.status === 'in_review' ? 'En revisión' : incident.status === 'resolved' ? 'Resuelta' : 'Cerrada sin ajuste'} />{session && <Detail label="Sesión relacionada" value={`${session.skill} · ${formatSessionSchedule(session.date, session.time)} · ${session.credits} créditos`} />}{incident.resolutionComment && <Detail label="Resolución registrada" value={`${incident.resolutionComment}${incident.resolvedBy ? ` · ${incident.resolvedBy}` : ''}`} />}</div>{incident.status === 'open' && <Button className="mt-6" onClick={() => void onReview(incident.id).then(saved => { if (saved) close(); })}>Tomar para revisión</Button>}{['open','in_review'].includes(incident.status) && <div className="mt-6 border-t border-[#E2E8E0] pt-5"><p className="font-bold">Resolver incidencia</p><div className="grid sm:grid-cols-3 gap-2 mt-3"><Button size="sm" variant={resolution === 'refund' ? 'secondary' : 'outline'} onClick={() => setResolution('refund')}>Devolver créditos</Button><Button size="sm" variant={resolution === 'release' ? 'secondary' : 'outline'} onClick={() => setResolution('release')}>Liberar al mentor</Button><Button size="sm" variant={resolution === 'no_adjustment' ? 'secondary' : 'outline'} onClick={() => setResolution('no_adjustment')}>Cerrar sin ajuste</Button></div><textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} required aria-label="Motivo obligatorio de la resolución" rows={3} placeholder="Motivo obligatorio de la resolución" className="mt-3 w-full rounded-xl border border-[#CBD8CE] p-3 text-sm" /><Button full className="mt-3" disabled={!comment.trim()} onClick={() => void onResolve(incident.id,resolution,comment).then(saved => { if (saved) close(); })}>Registrar resolución</Button></div>}</Modal>}
    </>
  );
}

function Credits({ state }: { state: AdminViewState }) {
  const [filter, setFilter] = useState('all');
  const visible = state.movements.filter(movement => filter === 'all' || movement.type === filter);
  const completed = (type: string) => state.movements.filter(movement => movement.type === type && movement.status === 'completed').reduce((sum,movement) => sum + Math.abs(movement.amount),0);
  const summaries = [['Créditos disponibles',Object.values(state.wallets).reduce((sum,wallet) => sum + wallet.available,0)],['Créditos reservados',state.wallets ? Object.values(state.wallets).reduce((sum,wallet) => sum + wallet.held,0) : 0],['Créditos devueltos',completed('refund')],['Obtenidos por mentorías',completed('earning')]];
  return (
    <>
      <PageIntro eyebrow="Supervisión únicamente" title="Créditos académicos" description="Consulta movimientos estables. Esta sección no permite crear créditos ni editar el historial." />
      <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-7">{summaries.map(([label,value]) => <Card key={String(label)} className="p-5"><p className="text-3xl font-bold text-[#24685F]">{value}</p><p className="mt-1 text-sm text-[#64748B]">{label}</p></Card>)}</section>
      <Filters value={filter} onChange={setFilter} options={[['all','Todos'],['initial_grant','Iniciales'],['hold','Reservas'],['refund','Devoluciones'],['earning','Mentorías'],['spent','Utilizados']]} />
      {visible.length === 0 ? <Empty title="No hay movimientos de este tipo" description="Los movimientos académicos aparecerán con su referencia estable." /> : <Table headers={['ID','Fecha','Usuario','Concepto','Tipo','Créditos','Referencia','Estado']}>{visible.map(item => <tr key={item.id} className="border-t border-[#E2E8E0]"><td className="p-4 font-mono text-xs">{item.id}</td><td className="p-4">{item.date}</td><td className="p-4">{item.userName || 'Usuario registrado'}</td><td className="p-4">{item.concept}</td><td className="p-4">{item.type}</td><td className="p-4 font-bold">{item.amount > 0 ? '+' : ''}{item.amount}</td><td className="p-4 font-mono text-xs">{item.reference}</td><td className="p-4"><StatusBadge status={item.status} /></td></tr>)}</Table>}
    </>
  );
}

function Account({ state }: { state: AdminViewState }) {
  return (
    <>
      <PageIntro eyebrow="Cuenta protegida" title="Mi cuenta" description="Información del administrador y registro de acciones relevantes dentro de SkillSwap AI." />
      <div className="grid lg:grid-cols-[340px_1fr] gap-6 mt-7">
        <Card className="p-6 h-fit"><Badge variant="primary">Administrador</Badge><h2 className="mt-4 text-xl font-bold">{adminIdentity.name}</h2><p className="mt-1 text-sm text-[#64748B]">{adminIdentity.email}</p><p className="mt-5 text-sm leading-6 text-[#60716C]">El registro público no permite crear administradores. Las decisiones quedan registradas en el historial de auditoría.</p></Card>
        <Card className="overflow-hidden"><div className="p-5 border-b border-[#E2E8E0]"><h2 className="text-xl font-bold">Auditoría administrativa</h2><p className="mt-1 text-sm text-[#64748B]">Aprobaciones, rechazos, suspensiones y resoluciones.</p></div>{state.adminAuditLog.length === 0 ? <div className="p-6"><Empty title="Aún no hay acciones registradas" description="La actividad administrativa aparecerá aquí." embedded /></div> : <div className="divide-y divide-[#E2E8E0]">{state.adminAuditLog.map(record => <div key={record.id} className="p-4"><div className="flex justify-between gap-4"><p className="font-semibold">{auditLabel(record.action)}</p><time className="text-xs text-[#64748B]" dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleString('es-PE',{timeZone:'America/Lima'})}</time></div><p className="mt-1 text-sm text-[#60716C]">{record.detail}</p><p className="mt-2 text-xs text-[#94A3B8]">{record.adminName} · {record.entityType} {record.entityId}</p></div>)}</div>}</Card>
      </div>
    </>
  );
}

function SessionDetail({ session, incident, onClose }: { session: ConfirmedBooking; incident?: AdminViewState['incidents'][number]; onClose: () => void }) {
  return <Modal title={`Sesión ${session.id}`} description={session.status} onClose={onClose}><div className="grid sm:grid-cols-2 gap-4 text-sm"><Detail label="Mentor" value={session.mentorName} /><Detail label="Estudiante" value={session.learnerName} /><Detail label="Habilidad y tema" value={`${session.skill}${session.topic ? ` · ${session.topic}` : ''}`} /><Detail label="Fecha" value={formatSessionSchedule(session.date,session.time)} /><Detail label="Duración" value={`${session.duration} minutos`} /><Detail label="Créditos" value={String(session.credits)} /><div><p className="font-bold">Enlace virtual</p><MeetingLink session={session} /></div><Detail label="Incidencia" value={incident ? `${incident.status}: ${incident.reason}` : 'Sin incidencias'} /></div><p className="mt-5 rounded-xl bg-[#F7F7F2] p-4 text-xs text-[#60716C]">Las sesiones completadas y sus movimientos históricos son de solo lectura.</p></Modal>;
}

function Filters({ value, onChange, options, compact = false }: { value: string; onChange: (value: string) => void; options: Array<[string,string]>; compact?: boolean }) {
  return <div className={`${compact ? '' : 'mt-6'} flex gap-2 overflow-x-auto pb-2`}>{options.map(([key,label]) => <Button key={key} size="sm" aria-pressed={value === key} variant={value === key ? 'secondary' : 'outline'} onClick={() => onChange(key)}>{label}</Button>)}</div>;
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return <Card className="mt-4 overflow-hidden"><div role="region" aria-label={headers.join(', ')} tabIndex={0} className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-[#F0F3ED]"><tr>{headers.map(header => <th key={header} scope="col" className="p-4 text-left text-xs font-bold uppercase tracking-wide text-[#60716C] whitespace-nowrap">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div></Card>;
}

function Modal({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: React.ReactNode }) {
  const id = useId(); const { busy, error } = useContext(OperationContext);
  return <NativeModal labelledBy={id} onClose={() => { if (!busy) onClose(); }}><Card className="w-full max-w-3xl max-h-[90dvh] overflow-y-auto p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><h2 id={id} className="text-2xl font-bold break-words">{title}</h2>{description && <p className="mt-1 text-sm text-[#64748B] break-all">{description}</p>}</div><Button disabled={busy} variant="ghost" className="!w-10 !p-0 shrink-0" onClick={onClose} icon={<Icons.X s={17} />}><span className="sr-only">Cerrar</span></Button></div>{error && <p role="alert" className="mt-4 text-sm text-[#B54747]">{error}</p>}<fieldset disabled={busy} className="mt-6 min-w-0">{children}</fieldset>{busy && <p role="status" className="mt-4">Guardando decisión…</p>}</Card></NativeModal>;
}

function Detail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? 'sm:col-span-2' : ''}><p className="text-xs font-bold uppercase tracking-wide text-[#64748B]">{label}</p><p className="mt-1 leading-6 text-[#334A46] whitespace-pre-wrap break-words">{value}</p></div>;
}

function Empty({ title, description, embedded = false }: { title: string; description: string; embedded?: boolean }) {
  const content = <div className="py-10 px-5 text-center"><Icons.Search s={28} c="mx-auto text-[#9AB8A4]" /><p className="mt-4 font-bold">{title}</p><p className="mt-2 text-sm text-[#64748B]">{description}</p></div>;
  return embedded ? content : <Card className="mt-6">{content}</Card>;
}

function StatusBadge({ status }: { status: string }) {
  const danger = ['rejected','cancelled','closed'].includes(status);
  const success = ['approved','completed','resolved'].includes(status);
  const warning = ['pending','observation','review','open','in_review','validation'].includes(status);
  const label: Record<string,string> = { pending:'Pendiente',observation:'En observación',approved:'Aprobada',rejected:'Rechazada',upcoming:'Programada',active:'En curso',validation:'Por validar',completed:'Completada',cancelled:'Cancelada',review:'Con incidencia',open:'Abierta',in_review:'En revisión',resolved:'Resuelta',closed:'Cerrada sin ajuste',initial_grant:'Inicial',hold:'Reserva',refund:'Devolución',earning:'Mentoría',spent:'Utilizado',release:'Liberación' };
  return <Badge variant={danger ? 'danger' : success ? 'success' : warning ? 'warning' : 'primary'}>{label[status] || status}</Badge>;
}

function auditLabel(action: AdminViewState['adminAuditLog'][number]['action']) {
  return {
    skill_approved: 'Habilidad aprobada',
    skill_rejected: 'Solicitud rechazada',
    skill_observed: 'Solicitud observada',
    account_suspended: 'Cuenta suspendida',
    account_reactivated: 'Cuenta reactivada',
    incident_reviewed: 'Incidencia en revisión',
    incident_resolved: 'Incidencia resuelta',
  }[action];
}

function incidentCategoryLabel(category: AdminViewState['incidents'][number]['category']) {
  return {
    mentor_absent: 'Mentor ausente',
    student_absent: 'Estudiante ausente',
    connection: 'Problemas de conexión',
    not_held: 'Sesión no realizada',
    completion_dispute: 'Desacuerdo sobre finalización',
    other: 'Otro problema relacionado',
  }[category] || 'Otro problema relacionado';
}
