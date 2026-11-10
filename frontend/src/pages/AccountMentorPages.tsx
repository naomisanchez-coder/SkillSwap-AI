import { useEffect, useRef, useState } from 'react';
import { Avatar, Badge, Button, Card } from '../components/ui';
import { AuthField, SelectField } from '../components/AuthFields';
import { SessionModal } from '../components/SessionModal';
import { Icons } from '../components/icons';
import { useStoredFile } from '../hooks/useStoredFile';
import type { UserProfile } from '../data/student';
import { AccountError, applicationStatuses, isHttpsPortfolio, normalizeApplication, normalizePersonalProfile, type AccountData, type MentorSkillRequest } from '../data/account';
import type { AccountService } from '../services/account';
import { ACTIVE_SKILLS } from '../data/skillCatalog';
import { ACCEPTED_PROFILE_PHOTO_TYPES, validateProfilePhoto } from '../data/profilePhotoStorage';
import { validateEvidencePdf } from '../data/evidenceStorage';

const textareaClass = 'mt-2 w-full border border-[#E2E8E0] rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#DCEBDD] focus:border-[#34877A]';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'No pudimos guardar los cambios. Vuelve a intentarlo.';

/** Vistas estudiantiles de AccountMentorPages.tsx del Make original. */
export function ProfilePage({ profile, photo, service, onChanged, onEditPreferences, onLogout, mentorSummary }: {
  profile: UserProfile; photo: ReturnType<typeof useStoredFile>; service: AccountService;
  onChanged: (account: AccountData) => void; onEditPreferences: () => void; onLogout: () => void;
  mentorSummary?: { approvedSkills: string[]; publishedOffers: number; averageRating: number; reviewCount: number };
}) {
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio);
  const [saved, setSaved] = useState(''); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const inFlight = useRef(false);
  const [photoOpen, setPhotoOpen] = useState(false); const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState(''); const [photoError, setPhotoError] = useState(''); const [checking, setChecking] = useState(false);
  const photoRevision = useRef(0); const photoInput = useRef<HTMLInputElement>(null); const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; heading.current?.focus(); return () => { mounted.current = false; }; }, []);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);
  const closePhoto = () => { if (inFlight.current) return; photoRevision.current++; setPhotoOpen(false); setPhotoFile(null); setPhotoPreview(''); setChecking(false); setPhotoError(''); };
  const selectPhoto = async (file?: File) => {
    if (!file || inFlight.current) return;
    const revision = ++photoRevision.current; setPhotoOpen(true); setPhotoFile(null); setPhotoPreview(''); setPhotoError(''); setChecking(true);
    try {
      const invalid = validateProfilePhoto(file); if (invalid) throw new Error(invalid);
      const bitmap = await createImageBitmap(file).catch(() => { throw new Error('El contenido del archivo no es una imagen válida.'); }); bitmap.close();
      if (!mounted.current || revision !== photoRevision.current) return;
      setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file));
    } catch (caught) { if (mounted.current && revision === photoRevision.current) setPhotoError(errorMessage(caught)); }
    finally { if (mounted.current && revision === photoRevision.current) setChecking(false); }
  };
  const save = async () => {
    if (inFlight.current) return;
    setError(''); setSaved('');
    try { normalizePersonalProfile({ name, bio }); } catch (caught) { setError(errorMessage(caught)); return; }
    inFlight.current = true; setBusy(true);
    try { const account = await service.saveProfile({ name, bio }); onChanged(account); setName(account.profile.name!); setBio(account.profile.bio!); setSaved('Perfil actualizado'); }
    catch (caught) { setError(errorMessage(caught)); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const savePhoto = async () => {
    if (!photoFile || inFlight.current) return;
    inFlight.current = true; setBusy(true); setPhotoError(''); setSaved('');
    try { const account = await service.savePhoto(photoFile); onChanged(account); setPhotoOpen(false); setPhotoFile(null); setPhotoPreview(''); setSaved('Fotografía actualizada'); }
    catch (caught) { setPhotoError(errorMessage(caught)); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <main className="max-w-[980px] mx-auto px-4 md:px-8 py-8 md:py-12 text-[#182B2A]">
    <section className="rounded-[24px] bg-[#DCEBDD] border border-[#C9D8CC] p-5 sm:p-7 md:p-9"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#24685F]">Tu cuenta</p><h1 ref={heading} tabIndex={-1} className="mt-2 text-3xl md:text-4xl font-extrabold">Mi perfil</h1><p className="mt-2 text-[#52645F]">Tus cambios actualizan el panel y el sistema de recomendaciones.</p></section>
    <form className="space-y-5 mt-8" onSubmit={event => { event.preventDefault(); void save(); }}>
      {mentorSummary && <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#24685F]">Perfil mentor</p><h2 className="mt-2 text-xl font-bold">Resumen académico compartido</h2></div><Badge variant="success">Misma cuenta TECSUP</Badge></div>
        <div className="grid sm:grid-cols-3 gap-4 mt-5">
          <div className="rounded-xl bg-[#F7F7F2] p-4"><p className="text-2xl font-bold text-[#24685F]">{mentorSummary.approvedSkills.length}</p><p className="text-sm text-[#64748B]">Habilidades aprobadas</p></div>
          <div className="rounded-xl bg-[#F7F7F2] p-4"><p className="text-2xl font-bold text-[#24685F]">{mentorSummary.publishedOffers}</p><p className="text-sm text-[#64748B]">Ofertas publicadas</p></div>
          <div className="rounded-xl bg-[#F7F7F2] p-4"><p className="text-2xl font-bold text-[#24685F]">{mentorSummary.reviewCount ? mentorSummary.averageRating.toFixed(1) : '—'}</p><p className="text-sm text-[#64748B]">{mentorSummary.reviewCount} valoraciones</p></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">{mentorSummary.approvedSkills.map(skill => <Badge key={skill}>{skill}</Badge>)}</div>
      </Card>}
      <Card className="p-5 sm:p-6"><h2 className="text-xl font-bold">Información personal</h2>
        <div className="mt-5 flex items-center gap-4"><div className="relative shrink-0"><Avatar name={name} src={photo.url || profile.photo} size="xl" /><button type="button" disabled={busy} onClick={event => { event.currentTarget.focus(); photoInput.current?.click(); }} aria-label="Cambiar fotografía de perfil" className="absolute -right-2 -bottom-2 w-11 h-11 rounded-full bg-[#24685F] text-white border-2 border-white flex items-center justify-center shadow-md hover:bg-[#1D5149]"><Icons.Camera s={16} /></button><input ref={photoInput} type="file" accept={ACCEPTED_PROFILE_PHOTO_TYPES.join(',')} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void selectPhoto(file); }} hidden /></div><div className="min-w-0 flex-1"><p className="font-bold">Fotografía de perfil</p><p className="mt-1 text-sm text-[#60716C]">JPG, PNG o WebP. Máximo 2 MB. Se guarda en este navegador.</p></div></div>
        {photo.loading && <p className="mt-3 text-sm" role="status">Recuperando fotografía…</p>}
        {photo.error && <div className="mt-3 text-sm text-[#B54747]"><p role="alert">No pudimos recuperar tu fotografía. {photo.error}</p><Button variant="outline" className="mt-2" onClick={photo.retry}>Reintentar fotografía</Button></div>}
        <fieldset disabled={busy} className="grid md:grid-cols-2 gap-4 mt-5"><AuthField id="personal-name" label="Nombre completo" value={name} onChange={value => { setName(value); setSaved(''); }} maxLength={120} autoComplete="name" /><AuthField id="personal-email" label="Correo institucional" type="email" value={profile.email} onChange={() => {}} disabled helper="Cambiar el correo requiere un proceso de verificación." /><AuthField id="personal-institution" label="Institución" value={profile.institution} onChange={() => {}} disabled /><AuthField id="personal-career" label="Carrera" value={profile.career} onChange={() => {}} disabled helper="Se registra al crear la cuenta." /><AuthField id="personal-cycle" label="Ciclo académico" value={`${profile.cycle}.º ciclo`} onChange={() => {}} disabled /></fieldset>
        <label htmlFor="personal-bio" className="block text-sm font-medium text-[#374151] mt-4">Biografía (opcional)</label><textarea id="personal-bio" disabled={busy} value={bio} maxLength={1000} onChange={event => { setBio(event.target.value); setSaved(''); }} rows={4} className={textareaClass} /><p className="mt-1 text-right text-xs text-[#60716C]">{bio.length}/1000</p>
      </Card>
      <Card className="p-5 sm:p-6"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><h2 className="text-xl font-bold">Mis intereses</h2><Button variant="outline" disabled={busy} onClick={onEditPreferences}>Editar preferencias</Button></div><div className="mt-5 flex flex-wrap gap-2">{profile.interests.map(skill => <Badge key={skill} variant="primary">{skill}</Badge>)}</div><dl className="grid md:grid-cols-2 gap-4 mt-5 text-sm"><div><dt className="font-bold">Nivel</dt><dd className="mt-1">{profile.level || 'Sin seleccionar'}</dd></div><div><dt className="font-bold">Objetivos</dt><dd className="mt-1">{profile.goals || 'Sin seleccionar'}</dd></div></dl></Card>
      <Card className="p-5 sm:p-6"><h2 className="text-xl font-bold">Preferencias de aprendizaje</h2><p className="mt-2 text-sm text-[#60716C]">Estas preferencias ordenan tus recomendaciones.</p><dl className="grid sm:grid-cols-2 gap-4 mt-5 text-sm"><div><dt className="font-bold">Días y bloque horario</dt><dd className="mt-1">{profile.availability || 'Sin seleccionar'}</dd></div><div><dt className="font-bold">Modalidad</dt><dd className="mt-1">Virtual</dd></div></dl></Card>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3"><Button type="submit" disabled={busy} size="lg">{busy ? 'Guardando…' : 'Guardar cambios'}</Button><p role="status" className="text-sm font-semibold text-[#28745A]">{saved}</p></div>{error && <p className="text-sm font-semibold text-[#B54747]" role="alert">{error}</p>}
      <Card className="p-5 sm:p-6"><h2 className="text-xl font-bold">Seguridad</h2><p className="mt-2 text-sm text-[#60716C]">Cambiar la contraseña todavía no está disponible desde el perfil.</p><Button className="mt-5" variant="outline" disabled={busy} onClick={onLogout}>Cerrar sesión</Button></Card>
    </form>
    {photoOpen && <SessionModal title="Actualizar fotografía" description="La imagen se guarda en este navegador. Puede perderse si borras los datos del sitio." busy={busy} onClose={closePhoto}>{checking && <p role="status">Comprobando imagen…</p>}{photoPreview && <img src={photoPreview} alt="Vista previa de la nueva fotografía" className="mx-auto w-48 h-48 rounded-full object-cover border-4 border-[#DCEBDD]" />}{photoError && <p role="alert" className="rounded-xl bg-[#FDECEC] p-4 text-sm text-[#B54747]">{photoError}</p>}<div className="mt-6 flex flex-col-reverse sm:flex-row justify-end gap-2"><Button variant="outline" disabled={busy} onClick={closePhoto}>Cancelar</Button><Button disabled={busy || checking || !photoFile} onClick={() => void savePhoto()}>{busy ? 'Guardando…' : 'Confirmar fotografía'}</Button></div></SessionModal>}
  </main>;
}

export function MentorApplicationPage({ initialRequest, existingRequests, service, onChanged, onBack }: { initialRequest?: MentorSkillRequest; existingRequests: MentorSkillRequest[]; service: AccountService; onChanged: (account: AccountData) => void; onBack: () => void }) {
  const [skill, setSkill] = useState(initialRequest?.skill || ''); const [level, setLevel] = useState<'Intermedio' | 'Avanzado'>(initialRequest?.level || 'Intermedio');
  const [experience, setExperience] = useState(initialRequest?.experience || ''); const [topics, setTopics] = useState(initialRequest?.topics || ''); const [portfolio, setPortfolio] = useState(initialRequest?.portfolio || '');
  const [file, setFile] = useState<File | null>(null); const [evidenceError, setEvidenceError] = useState(''); const [error, setError] = useState(''); const [checking, setChecking] = useState(false); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  const [id] = useState(() => initialRequest?.id || `REQ-${crypto.randomUUID()}`); const [submissionId] = useState(() => crypto.randomUUID());
  const revision = useRef(0); const inFlight = useRef(false); const heading = useRef<HTMLHeadingElement>(null);
  const evidence = useStoredFile(initialRequest?.evidenceStorageId, service.getEvidence);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; heading.current?.focus(); return () => { mounted.current = false; }; }, []);
  const duplicate = existingRequests.some(item => item.id !== initialRequest?.id && ['pending', 'observation', 'approved'].includes(item.status) && item.skill.toLowerCase() === skill.toLowerCase());
  const selectFile = async (value?: File) => {
    if (!value || inFlight.current) return;
    const current = ++revision.current; setFile(null); setChecking(true); setEvidenceError(''); setError('');
    try { const error = await validateEvidencePdf(value); if (!mounted.current || current !== revision.current) return; if (error) setEvidenceError(error); else setFile(value); }
    catch { if (mounted.current && current === revision.current) setEvidenceError('No se pudo leer el PDF. Selecciónalo nuevamente.'); }
    finally { if (mounted.current && current === revision.current) setChecking(false); }
  };
  const submit = async () => {
    if (inFlight.current || checking) return; setError('');
    try {
      normalizeApplication({ skill, level, experience, topics, portfolio });
      if (duplicate) throw new AccountError('duplicate', 'Ya tienes una solicitud activa para esta habilidad.');
      if (!file && (!evidence.url || evidenceError)) throw new Error('Adjunta un PDF válido de hasta 5 MB.');
    } catch (caught) { setError(errorMessage(caught)); return; }
    inFlight.current = true; setBusy(true);
    try { const account = await service.submitApplication({ id, submissionId, skill, level, experience, topics, portfolio, evidenceFile: file ?? undefined, evidenceStorageId: initialRequest?.evidenceStorageId }); onChanged(account); setSent(true); requestAnimationFrame(() => heading.current?.focus()); }
    catch (caught) { setError(errorMessage(caught)); }
    finally { inFlight.current = false; setBusy(false); }
  };
  if (sent) return <main className="min-h-[70dvh] flex items-center justify-center p-4"><Card className="w-full max-w-lg p-6 sm:p-8 text-center"><div className="w-16 h-16 mx-auto rounded-full bg-[#FEF3C7] text-[#F59E0B] flex items-center justify-center"><Icons.Clock s={28} /></div><h1 ref={heading} tabIndex={-1} className="mt-5 text-3xl font-bold text-[#111827]">Pendiente de revisión</h1><p className="mt-3 text-[#64748B]">Recibimos tu solicitud. Quedará pendiente de revisión administrativa.</p><p className="mt-3 rounded-xl bg-[#F2E8D7] p-3 text-xs leading-5 text-[#6B5836]">El PDF completo se conserva en este navegador y origen. No se comparte entre dispositivos y puede perderse al borrar los datos del sitio.</p><Button className="mt-6" onClick={onBack}>Ver mis habilidades</Button></Card></main>;
  return <main className="py-8 md:py-10 px-4 text-[#182B2A]"><div className="max-w-3xl mx-auto"><Button variant="ghost" disabled={busy} onClick={onBack} icon={<Icons.ChevLeft s={15} />}>Volver</Button><Card className="mt-4 p-5 sm:p-6 md:p-8"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#24685F]">Solicitud documental</p><h1 ref={heading} tabIndex={-1} className="mt-2 text-3xl font-bold">{initialRequest ? 'Corrige y reenvía tu solicitud' : 'Comparte lo que sabes'}</h1><p className="mt-2 text-[#64748B]">Solicita la validación de tus conocimientos y comienza a compartir habilidades con otros estudiantes.</p>
    {initialRequest?.adminComment && <p className="mt-4 rounded-xl bg-[#FEF3C7] p-4 text-sm text-[#92400E]"><strong>Observación:</strong> {initialRequest.adminComment}</p>}
    <form onSubmit={event => { event.preventDefault(); void submit(); }}><fieldset disabled={busy}><div className="grid md:grid-cols-2 gap-4 mt-7"><SelectField id="application-skill" label="Habilidad que deseas enseñar" value={skill} onChange={setSkill}><option value="">Selecciona una habilidad</option>{ACTIVE_SKILLS.map(item => <option key={item.id}>{item.name}</option>)}</SelectField><SelectField id="application-level" label="Nivel declarado" value={level} onChange={value => setLevel(value as typeof level)}><option>Intermedio</option><option>Avanzado</option></SelectField></div>
    <label htmlFor="application-experience" className="block text-sm font-medium text-[#374151] mt-4">Descripción de experiencia</label><textarea id="application-experience" value={experience} maxLength={2000} onChange={event => setExperience(event.target.value)} rows={4} className={textareaClass} />
    <label htmlFor="application-topics" className="block text-sm font-medium text-[#374151] mt-4">Temas que puedes enseñar</label><textarea id="application-topics" value={topics} maxLength={2000} onChange={event => setTopics(event.target.value)} rows={3} className={textareaClass} />
    <AuthField id="application-portfolio" label="Enlace de portafolio o proyecto (opcional)" value={portfolio} onChange={setPortfolio} placeholder="https://" maxLength={2048} error={!isHttpsPortfolio(portfolio) ? 'Ingresa una URL HTTPS válida.' : undefined} />
    <div className="mt-4"><label htmlFor="application-evidence" className="block text-sm font-medium text-[#374151]">Documento de evidencia</label><input id="application-evidence" type="file" accept="application/pdf,.pdf" aria-describedby="evidence-help" onChange={event => { const value = event.target.files?.[0]; event.target.value = ''; void selectFile(value); }} className="mt-2 w-full min-w-0 border border-dashed border-[#CBD5E1] rounded-xl p-3 text-sm" /><p id="evidence-help" className="text-xs text-[#64748B] mt-2">Solo PDF, máximo 5 MB. El documento completo se guarda al enviar en este navegador. No se comparte entre dispositivos y puede perderse al borrar los datos del sitio.</p>
    {(checking || (!file && evidence.loading)) && <p role="status" className="mt-2 text-xs">Comprobando el documento PDF…</p>}
    {(file?.name || initialRequest?.evidenceName) && <p className="mt-2 text-xs font-semibold text-[#28745A] break-all">{file?.name || initialRequest?.evidenceName}</p>}
    {!file && evidence.url && <a href={evidence.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#24685F] underline">Abrir PDF actual</a>}
    {(evidenceError || (!file && evidence.error)) && <p className="mt-2 text-xs text-[#B54747]" role="alert">{evidenceError || evidence.error}</p>}
    {!file && initialRequest?.evidenceName && !initialRequest.evidenceStorageId && <p role="alert" className="mt-2 text-xs text-[#B54747]">Solo se conservó el nombre. Adjunta nuevamente el PDF.</p>}
    </div></fieldset>{duplicate && <p className="mt-4 rounded-xl bg-[#F2E8D7] p-4 text-sm text-[#6B5836]">Ya tienes una solicitud activa para esta habilidad.</p>}{error && <p role="alert" className="mt-4 text-sm text-[#B54747]">{error}</p>}<Button full size="lg" type="submit" className="mt-7" disabled={busy || checking || duplicate || (!file && evidence.loading)}>{busy ? 'Guardando solicitud…' : 'Enviar solicitud'}</Button></form>
  </Card></div></main>;
}

function EvidenceLink({ request, service }: { request: MentorSkillRequest; service: AccountService }) {
  const file = useStoredFile(request.evidenceStorageId, service.getEvidence);
  return <div className="mt-3"><p className="break-all"><strong>Evidencia:</strong> {request.evidenceName}</p>{file.loading ? <p role="status" className="mt-2 text-xs">Recuperando PDF…</p> : file.url ? <a href={file.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-[#24685F] underline" aria-label={`Abrir PDF ${request.evidenceName}`}>Abrir PDF</a> : <><p role="alert" className="mt-2 text-xs text-[#B54747]">{file.error || 'El documento no está disponible en este navegador. Solo se conserva su nombre.'}</p>{request.evidenceStorageId && <Button variant="outline" className="mt-2" onClick={file.retry}>Reintentar PDF</Button>}</>}</div>;
}
export function SkillsPage({ profile, requests, service, onNew, onEdit, onEditPreferences, initialRequestId }: { initialRequestId?: string; profile: UserProfile; requests: MentorSkillRequest[]; service: AccountService; onNew: () => void; onEdit: (id: string) => void; onEditPreferences: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null); useEffect(() => { heading.current?.focus(); }, []);
  const [selectedId, setSelectedId] = useState(initialRequestId);
  const selected = requests.find(item => item.id === selectedId && item.ownerUserId === profile.id);
  return <main className="max-w-[1060px] mx-auto px-4 md:px-8 py-8 md:py-12 text-[#182B2A]"><section className="rounded-[24px] bg-[#F2E8D7] border border-[#E7D8BF] p-5 sm:p-7 md:p-9"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#24685F]">Aprender y compartir</p><h1 ref={heading} tabIndex={-1} className="mt-2 text-3xl md:text-4xl font-extrabold">Mis habilidades</h1><p className="mt-2 text-[#60716C]">Organiza lo que quieres aprender y sigue tus solicitudes para enseñar.</p></section>
    <section className="mt-7 rounded-[20px] border border-[#E2E8E0] bg-white p-5 sm:p-6"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#24685F]">Quiero aprender</p><h2 className="mt-2 text-xl font-bold">Mis intereses</h2></div><Button variant="outline" onClick={onEditPreferences}>Editar preferencias</Button></div><div className="mt-5 flex flex-wrap gap-2">{profile.interests.map(skill => <Badge variant="primary" key={skill}>{skill}</Badge>)}</div></section>
    <div className="mt-7 flex flex-col sm:flex-row sm:items-end justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#24685F]">Quiero enseñar</p><h2 className="mt-2 text-2xl font-bold">Solicitudes de habilidad</h2><p className="mt-2 text-[#64748B]">La aprobación corresponde exclusivamente al administrador.</p></div><Button onClick={onNew} icon={<Icons.Plus s={15} />}>Nueva solicitud</Button></div>
    <div className="grid md:grid-cols-2 gap-4 mt-8">{!requests.length ? <Card className="md:col-span-2 py-16 text-center px-5"><Icons.Award s={38} c="mx-auto text-[#9AB8A4]" /><p className="mt-4 font-bold">Todavía no tienes solicitudes para enseñar</p><p className="mt-2 text-sm text-[#64748B]">Envía evidencia documental para revisión administrativa.</p><Button className="mt-5" onClick={onNew}>Solicitar validación</Button></Card> : requests.map(request => <Card key={request.id} className="p-5 sm:p-6 min-w-0 break-words"><RequestDetails request={request} service={service} onEdit={onEdit} /></Card>)}</div>
  {selected && <SessionModal title="Detalle de solicitud" description={selected.id} onClose={() => { setSelectedId(undefined); requestAnimationFrame(() => heading.current?.focus()); }}><RequestDetails request={selected} service={service} onEdit={onEdit} /></SessionModal>}</main>;
}

function RequestDetails({ request, service, onEdit }: { request: MentorSkillRequest; service: AccountService; onEdit: (id: string) => void }) {
  return <div className="min-w-0 break-words"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-xl font-bold text-[#111827]">{request.skill}</h3><p className="text-sm text-[#64748B] mt-1">{request.level}</p></div><Badge variant={applicationStatuses[request.status][1]}>{applicationStatuses[request.status][0]}</Badge></div><div className="mt-5 space-y-2 text-sm text-[#64748B]"><p className="break-all"><strong>Solicitud:</strong> {request.id}</p><EvidenceLink request={request} service={service} /><p><strong>Fecha:</strong> {new Date(request.requestedAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</p><p className="whitespace-pre-wrap"><strong>Experiencia:</strong> {request.experience}</p><p className="whitespace-pre-wrap"><strong>Temas:</strong> {request.topics}</p>{request.portfolio && <a href={request.portfolio} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-[#24685F] underline">Ver portafolio</a>}{request.adminComment && <p className="p-3 rounded-lg bg-[#FEF3C7] text-[#92400E]"><strong>Observación:</strong> {request.adminComment}</p>}</div>{['observation', 'rejected'].includes(request.status) && <div className="mt-5"><Button variant="outline" onClick={() => onEdit(request.id)}>{request.status === 'observation' ? 'Corregir y reenviar' : 'Corregir y reintentar'}</Button><p className="text-xs text-[#64748B] mt-2">La solicitud conserva su identificador e historial administrativo.</p></div>}<details className="mt-5 text-sm"><summary className="min-h-11 cursor-pointer font-semibold text-[#24685F]">Historial de solicitud</summary><ol className="space-y-3 mt-2">{request.history.map(event => <li key={event.id}><p className="font-semibold">{applicationStatuses[event.status][0]}</p><time dateTime={event.at} className="text-xs text-[#64748B]">{new Date(event.at).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</time>{event.comment && <p className="mt-1 whitespace-pre-wrap">{event.comment}</p>}</li>)}</ol></details></div>;
}
