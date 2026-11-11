import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalAccountStore, accountStorageKey, type AccountFiles } from '../src/dev/accountStore';
import { createLocalBookingStore, bookingStorageKey } from '../src/dev/bookingStore';
import { mentors } from '../src/dev/mentorFixtures';
import { getNextAvailableDates } from '../src/data/scheduling';
import { validateEvidencePdf } from '../src/data/evidenceStorage';
import { adminIdentity, type AdminActivityAction, type SkillDecision } from '../src/data/admin';

function fixture() {
  const values = new Map<string, string>(); let fail = false; const pdfs = new Map<string, Blob>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { if (fail) throw new Error('quota'); values.set(key, value); }, removeItem: (key: string) => values.delete(key) };
  const files: AccountFiles = { validateEvidence: validateEvidencePdf, async saveEvidence(file) { const id = crypto.randomUUID(); pdfs.set(id,file); return id; }, async getEvidence(id) { return pdfs.get(id) ?? null; }, async removeEvidence(id) { pdfs.delete(id); }, async savePhoto() { return 'photo'; }, async getPhoto() { return null; }, async removePhoto() {} };
  const now = () => new Date('2030-04-01T12:00:00-05:00'); const identity = { id: 'current', name: 'Alex' }; const initialWallet = { available: 20, held: 0, used: 0, earned: 0 };
  const accountOptions = { storage: () => storage, files, identity, now }; const account = createLocalAccountStore(accountOptions);
  const bookingOptions = { storage: () => storage, routeStorage: () => storage, identity, initialWallet, now, getMentors: () => structuredClone(mentors) }; const activity = createLocalBookingStore(bookingOptions);
  const application = { id: 'REQ-admin', submissionId: 'SUB-admin', skill: 'Python', level: 'Intermedio' as const, experience: 'Proyectos Python', topics: 'Variables', portfolio: '', evidenceFile: new File(['%PDF-1.7\nDocumento\n%%EOF'], 'evidencia.pdf', { type: 'application/pdf' }) };
  const decision: SkillDecision = { id: application.id, submissionId: application.submissionId, decisionId: 'DEC-admin', status: 'rejected', comment: 'Adjunta evidencia más clara.' };
  const knownUsers = ['current', 'mentor-carlos'];
  const command = { id: 'SES-admin', mentorId: 'carlos', date: getNextAvailableDates(mentors[0].slots,8,now())[0], time: '7:00 PM', duration: 30 as const };
  const report = () => activity.updateSession({ type: 'report', sessionId: command.id, category: 'connection', reason: 'La conexión falló.' });
  const admin = (command: AdminActivityAction) => activity.updateAdmin(command, knownUsers);
  return { values, account, activity, accountOptions, bookingOptions, application, decision, command, admin, report, pdfs, failStorage: (value: boolean) => { fail = value; } };
}

test('administración: rechazo exige observación; decisión, historial, notificación y auditoría se guardan juntos', async () => {
  const f = fixture(); await f.account.submitApplication(f.application);
  await assert.rejects(f.account.decideSkill({ ...f.decision, comment: '  ' }));
  await assert.rejects(f.account.decideSkill({ ...f.decision, comment: 'x'.repeat(2001) }));
  await Promise.all(Array.from({length:10},()=>f.account.decideSkill(f.decision)));
  const value = await createLocalAccountStore(f.accountOptions).getAccount(); const request = value.requests[0];
  assert.equal(request.status,'rejected'); assert.equal(request.adminComment,f.decision.comment); assert(request.reviewedAt);
  assert.equal(request.history.filter(item=>item.id===f.decision.decisionId).length,1); assert.equal(value.adminAuditLog?.length,1);
  assert.equal(value.notifications.filter(item=>item.id===`NOT-${f.decision.decisionId}-review`).length,1);
  assert.equal(value.adminAuditLog?.[0].adminId,adminIdentity.id);
  assert.equal(await (await f.account.getEvidence(request.evidenceStorageId!))?.text(),await f.application.evidenceFile.text());
  f.pdfs.clear(); assert.equal(await f.account.getEvidence(request.evidenceStorageId!),null); assert.equal((await f.account.getAccount()).requests[0].evidenceName,'evidencia.pdf');
});

test('aprobación tras corregir conserva rechazo; revisión obsoleta o contraria no sobrescribe una decisión', async () => {
  const f=fixture(); await f.account.submitApplication(f.application); await f.account.decideSkill(f.decision);
  await f.account.submitApplication({...f.application,submissionId:'SUB-corrected'});
  await assert.rejects(f.account.decideSkill({...f.decision,decisionId:'DEC-stale',status:'approved'}));
  await f.account.decideSkill({...f.decision,submissionId:'SUB-corrected',decisionId:'DEC-approved',status:'approved',comment:''});
  await assert.rejects(f.account.decideSkill({...f.decision,submissionId:'SUB-corrected',decisionId:'DEC-conflict'}));
  const value=await f.account.getAccount(); assert.equal(value.requests[0].status,'approved'); assert(value.requests[0].history.some(item=>item.comment===f.decision.comment)); assert.equal(value.adminAuditLog?.length,2);
});

test('decisiones: fallo de guardado no cambia solicitud ni auditoría y admite reintento', async () => {
  const f=fixture(); await f.account.submitApplication(f.application);const before=f.values.get(accountStorageKey);f.failStorage(true);
  await assert.rejects(f.account.decideSkill(f.decision));assert.equal(f.values.get(accountStorageKey),before); f.failStorage(false); await f.account.decideSkill(f.decision);assert.equal((await f.account.getAccount()).requests[0].status,'rejected');
});

test('suspender/reactivar es idempotente y bloquea reserva y acciones de sesión de la cuenta afectada', async()=>{
  const f=fixture();await f.activity.confirmBooking(f.command);await Promise.all(Array.from({length:5},()=>f.admin({type:'suspension',userId:'current',suspended:true})));
  await assert.rejects(f.report());await assert.rejects(f.activity.confirmBooking({...f.command,id:'another'}));await assert.rejects(f.admin({type:'suspension',userId:adminIdentity.id,suspended:true}));
  let value=await f.activity.getLedger();assert.equal(value.adminAuditLog?.length,1);assert.equal(value.wallet.held,5);
  await f.admin({type:'suspension',userId:'current',suspended:false}); await f.admin({type:'suspension',userId:'mentor-carlos',suspended:true});
  await assert.rejects(f.activity.confirmBooking({...f.command,id:'another',date:getNextAvailableDates(mentors[0].slots,8,new Date('2030-04-01T12:00:00-05:00'))[1]}));
  value=await createLocalBookingStore(f.bookingOptions).getLedger();assert.deepEqual(value.suspendedUserIds,['mentor-carlos']);assert.equal(value.adminAuditLog?.length,3);
});

for(const resolution of ['refund','release','no_adjustment'] as const) test(`incidencia: ${resolution}, reintentos concurrentes y recarga sin ajuste duplicado`,async()=>{
  const f=fixture();await f.activity.confirmBooking(f.command);const reported=await f.report();const id=reported.incidents[0].id;
  await Promise.all(Array.from({length:4},()=>f.admin({type:'review',id})));
  const command={type:'resolve' as const,id,resolution,comment:'Evidencia revisada.'};await Promise.all(Array.from({length:10},()=>f.admin(command)));
  const value=await createLocalBookingStore(f.bookingOptions).getLedger();assert.equal(value.adminAuditLog?.length,2);assert.equal(value.incidents[0].status,resolution==='no_adjustment'?'closed':'resolved');assert.equal(value.incidents[0].resolutionComment,command.comment);
  assert.equal(value.wallet.held,resolution==='no_adjustment'?5:0);assert.equal(value.wallet.available,resolution==='refund'?20:15);
  assert.equal(value.movements.filter(item=>item.type==='earning').length,resolution==='release'?1:0);assert.equal(value.movements.filter(item=>item.type==='refund').length,resolution==='refund'?1:0);
  if(resolution==='release'){assert(value.sessions[0].adminResolution);assert.equal(value.sessions[0].performedAt,undefined);assert.equal(value.sessions[0].validatedAt,undefined);await f.activity.updateSession({type:'rate',sessionId:f.command.id,rating:5,comment:'Resuelto.'});}
  await assert.rejects(f.admin({...command,resolution:resolution==='refund'?'release':'refund'}));
});

test('incidencias sucesivas: IDs, eventos, notificaciones y auditoría únicos; cierre sin ajuste permite reiniciar',async()=>{
  const f=fixture();await f.activity.confirmBooking(f.command);
  for(let index=0;index<3;index++){
    await f.activity.applyMentorFixture({type:'start',sessionId:f.command.id,mentorId:'carlos'});const value=await f.report();const id=value.incidents[0].id;
    await f.admin({type:'resolve',id,resolution:'no_adjustment',comment:`Revisión ${index}`});
  }
  const fourth=await f.report();await f.admin({type:'resolve',id:fourth.incidents[0].id,resolution:'refund',comment:'Devolución final.'});
  const value=await f.activity.getLedger();assert.equal(value.incidents.length,4);assert.equal(new Set(value.incidents.map(item=>item.id)).size,4);assert.equal(new Set(value.notifications.map(item=>item.id)).size,value.notifications.length);assert.equal(new Set(value.sessions[0].history!.map(item=>item.id)).size,value.sessions[0].history!.length);assert.equal(value.movements.filter(item=>item.type==='refund').length,1);assert.equal(value.wallet.available,20);
});

test('fallos de suspensión y cada resolución conservan saldo, incidente y auditoría; recobro posterior',async()=>{
  for(const resolution of ['refund','release','no_adjustment'] as const){
    const f=fixture();await f.activity.confirmBooking(f.command);const reported=await f.report();const before=f.values.get(bookingStorageKey);f.failStorage(true);
    await assert.rejects(f.admin({type:'suspension',userId:'current',suspended:true}));await assert.rejects(f.admin({type:'review',id:reported.incidents[0].id}));await assert.rejects(f.admin({type:'resolve',id:reported.incidents[0].id,resolution,comment:'Resolución'}));assert.equal(f.values.get(bookingStorageKey),before);
    f.failStorage(false);await f.admin({type:'resolve',id:reported.incidents[0].id,resolution,comment:'Resolución'});assert.equal((await f.activity.getLedger()).adminAuditLog?.length,1);
  }
});
