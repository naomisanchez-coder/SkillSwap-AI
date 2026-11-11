import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewAccess, previewLogoutKey } from '../src/dev/previewAccess';
import { logoutSession } from '../src/services/auth';
import { composeMentorCatalog } from '../src/data/catalog';
import { mentors } from '../src/dev/mentorFixtures';
import { defaultOffer } from '../src/data/mentor';
import { isEligibleMentor } from '../src/data/recommendations';
import type { AccountData, MentorSkillRequest } from '../src/data/account';
import type { BookingLedger } from '../src/data/booking';

class MemoryStorage {
  values = new Map<string,string>(); fail = false;
  getItem(key:string) { return this.values.get(key) ?? null; }
  setItem(key:string,value:string) { if(this.fail) throw new Error('quota'); this.values.set(key,value); }
  removeItem(key:string) { this.values.delete(key); }
}
test('logout de prueba: invalida ambos roles entre pestañas y conserva datos guardados',()=>{
  const local=new MemoryStorage(), first=new MemoryStorage(), second=new MemoryStorage();
  const a=createPreviewAccess(local,first), b=createPreviewAccess(local,second);
  local.setItem('skillswap:frontend-demo:account:v1','perfil y archivos');local.setItem('skillswap:frontend-demo:bookings:v1','reservas e historial');
  a.enter('student');b.enter('admin');first.setItem('skillswap:frontend:page','sessions');first.setItem('skillswap:frontend-demo:booking-route:v1','borrador');
  a.logout();assert.equal(a.read(),'public');assert.equal(b.read(),'public');assert.equal(first.getItem('skillswap:frontend:page'),null);assert.equal(first.getItem('skillswap:frontend-demo:booking-route:v1'),null);
  assert.equal(local.getItem('skillswap:frontend-demo:account:v1'),'perfil y archivos');assert.equal(local.getItem('skillswap:frontend-demo:bookings:v1'),'reservas e historial');assert(local.getItem(previewLogoutKey));
  assert.equal(createPreviewAccess(local,first).read(),'public');assert.equal(createPreviewAccess(local,new MemoryStorage()).read(),'public');
  a.enter('student');assert.equal(a.read(),'student');assert.equal(b.read(),'public');a.logout();assert.equal(a.read(),'public');
});
test('fallo al registrar salida de prueba: no afirma cierre ni borra el acceso actual',()=>{
  const local=new MemoryStorage(), session=new MemoryStorage(), access=createPreviewAccess(local,session);access.enter('admin');local.fail=true;
  assert.throws(()=>access.logout());assert.equal(access.read(),'admin');
});
test('logout real envía cookie y CSRF en cabecera; exige 200/status ok y controla respuestas fallidas',async()=>{
  const previous=globalThis.fetch,csrf='a'.repeat(64);let calls=0;
  try {
    globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'http://127.0.0.1:3000/api/auth/logout');assert.equal(options?.method,'POST');assert.equal(options?.credentials,'include');assert.equal(options?.cache,'no-store');assert.equal((options?.headers as Record<string,string>)['X-CSRF-Token'],csrf);assert.equal(options?.body,'{}');return new Response(JSON.stringify({status:'ok'}),{status:200});};
    await logoutSession(csrf,new AbortController().signal,'http://127.0.0.1:3000/api/');assert.equal(calls,1);
    await assert.rejects(logoutSession('',new AbortController().signal,'http://127.0.0.1:3000/api'));assert.equal(calls,1);
    for(const [status,body] of [[403,{error:{code:'CSRF_INVALID'}}],[500,{error:{code:'INTERNAL_ERROR'}}],[200,{}],[404,{}],[204,null]] as const){globalThis.fetch=async()=>new Response(status===204?null:JSON.stringify(body),{status});await assert.rejects(logoutSession(csrf,new AbortController().signal,'http://127.0.0.1:3000/api'));}
    globalThis.fetch=async()=>{throw new Error('red');};await assert.rejects(logoutSession(csrf,new AbortController().signal,'http://127.0.0.1:3000/api'));
  } finally {globalThis.fetch=previous;}
});
test('catálogo compartido: aprobación, publicación, pausa, suspensión/reactivación y exclusión propia',()=>{
  const request:MentorSkillRequest={id:'REQ-shared',ownerUserId:'current',userName:'Alex',skill:'Python',level:'Intermedio',experience:'Experiencia Python',topics:'Variables',portfolio:'',evidenceName:'doc.pdf',requestedAt:new Date().toISOString(),status:'pending',history:[],submissionId:'SUB-shared',submissionSignature:'signature'};
  const account:AccountData={version:1,userId:'current',profile:{name:'Alex'},requests:[request],notifications:[]};
  const ledger:BookingLedger={version:1,studentId:'current',wallet:{available:20,held:0,used:0,earned:0},sessions:[],movements:[],notifications:[],incidents:[],reviews:[],mentorBalances:{},mentorSettings:{current:{availability:{Martes:['7:00 PM']},offers:{[request.id]:{...defaultOffer(request),active:true}}}}};
  const publicIds=()=>composeMentorCatalog(mentors,account,ledger,'Alex').filter(item=>isEligibleMentor(item)).map(item=>item.id);
  const own='student-mentor-current:REQ-shared';assert(!publicIds().includes(own));request.status='approved';assert(publicIds().includes(own));
  const privateIds=composeMentorCatalog(mentors,account,ledger,'Alex').filter(item=>isEligibleMentor(item,'current')).map(item=>item.id);assert.deepEqual(privateIds,publicIds().filter(id=>id!==own));
  ledger.mentorSettings!.current.offers[request.id].active=false;assert(!publicIds().includes(own));ledger.mentorSettings!.current.offers[request.id].active=true;
  ledger.suspendedUserIds=['current','mentor-carlos'];assert(!publicIds().includes(own));assert(!publicIds().includes('carlos'));ledger.suspendedUserIds=[];assert(publicIds().includes(own));assert(publicIds().includes('carlos'));assert.equal(mentors[0].active,true);
});
