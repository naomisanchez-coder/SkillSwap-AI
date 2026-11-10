import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {createDatabase} from '../src/config/db.js';
import {createAuthRepository} from '../src/modules/auth/auth.repository.js';
import {createEmailRepository} from '../src/modules/auth/email.repository.js';
import {createEmailRateRepository} from '../src/modules/auth/email-rate.repository.js';
import {createEmailService} from '../src/modules/auth/email.service.js';
import {createCodeProtection,createRateIdentifier} from '../src/modules/auth/email-code.js';
import {hashPassword} from '../src/modules/auth/password.service.js';
const enabled=process.env.OTP_TEST_SCHEMA_002==='yes'&&Boolean(process.env.DATABASE_TEST_DB);
function faultDatabase(config,mode){
 const stats={confirmationCommits:0,committedConfirmations:0,rollbacks:0};
 const database=createDatabase(config,{poolFactory(options){
  const pool=mysql.createPool(options);
  return {end:()=>pool.end(),async getConnection(){
   const c=await pool.getConnection();let confirming=false;
   return {query:(...args)=>c.query(...args),beginTransaction:()=>c.beginTransaction(),
    async execute(query,values){
     if(query.sql.startsWith("UPDATE email_verifications SET status = 'PENDING'")){
      confirming=true;
      if(mode==='update')return c.execute({...query,sql:query.sql.replace("SET status = 'PENDING'","SET status = 'INVALID'")},values);
     }
     // All compensation failures are actual MySQL CHECK failures on test-owned rows.
     if(query.sql.startsWith("UPDATE email_verifications SET status = 'REVOKED'"))return c.execute({...query,sql:query.sql.replace("SET status = 'REVOKED'","SET status = 'INVALID'")},values);
     return c.execute(query,values);
    },async commit(){
     if(confirming){stats.confirmationCommits++;if(mode==='before-commit')throw Object.assign(Error('Injected pre-COMMIT failure'),{code:'E_TEST_COMMIT'});}
     const result=await c.commit();
     if(confirming){stats.committedConfirmations++;if(mode==='after-commit')throw Object.assign(Error('Injected lost COMMIT acknowledgement'),{code:'E_TEST_ACK_LOST'});}
     return result;
    },async rollback(){if(confirming)stats.rollbacks++;return c.rollback();},release:()=>c.release(),destroy:()=>c.destroy()};
  }};
 }});
 return {database,stats};
}
test('real MySQL transactions with injected transport/update/COMMIT faults remain consistent',{
 skip:enabled?false:'002 isolated integration not enabled',timeout:60000,
},async t=>{
 let db;let created=false;const career=randomUUID();const userIds=[];
 const emails=Array.from({length:4},()=>`fault.${[...randomBytes(18)].map(n=>String.fromCharCode(97+n%26)).join('')}@tecsup.edu.pe`);
 const identifier=createRateIdentifier(randomBytes(32).toString('hex'));
 try{
  assert.equal(process.env.DATABASE_TEST_DB,'skillswap_ai_test_auth');assert.equal(process.env.DATABASE_TEST_USER,'skillswap_test_app');
  const config={host:'127.0.0.1',port:3306,user:process.env.DATABASE_TEST_USER,password:process.env.DATABASE_TEST_PASSWORD,database:process.env.DATABASE_TEST_DB};
  db=createDatabase(config);const [[identity]]=await db.execute('SELECT CURRENT_USER() AS account');assert.equal(identity.account,'skillswap_test_app@127.0.0.1');
  const [history]=await db.execute('SELECT version FROM schema_migrations WHERE version=?',['002_otp_delivery_safety']);assert.equal(history.length,1);
  await db.transaction(async tx=>{await tx.execute('INSERT INTO careers (id,code,name) VALUES (?,?,?)',[career,`FAULT_${career}`,`Transport fixture ${career}`]);await tx.execute('INSERT INTO career_cycles (career_id,cycle) VALUES (?,?)',[career,3]);});created=true;
  const passwordHash=await hashPassword(randomBytes(24).toString('hex'));const auth=createAuthRepository(db);
  for(const email of emails){const user=await auth.createStudent({firstName:'Prueba',lastName:'Aislada',email,career:`Transport fixture ${career}`,cycle:3,passwordHash,termsAcceptedAt:new Date(),termsVersion:'isolated-test',privacyVersion:'isolated-test'});userIds.push(user.id);}
  for(const [index,mode]of ['smtp','update','before-commit','after-commit'].entries())await t.test(mode,async()=>{
   const f=faultDatabase(config,mode);let service;let attempted=0;const events=[];
   try{
    service=createEmailService({repository:createEmailRepository(f.database),rateRepository:createEmailRateRepository(db),rateIdentifier:identifier,
     protection:createCodeProtection({keyHex:randomBytes(32).toString('hex'),keyVersion:'isolated-fault'}),
     onEvent:e=>events.push(e),mailer:{async sendVerification(){attempted++;if(mode==='smtp')throw Error('Injected SMTP failure');}}});
    const accepted=await service.request({email:emails[index]});assert.equal(accepted.status,'accepted');await service.idle();
    const [[row]]=await db.execute('SELECT status FROM email_verifications WHERE id=?',[accepted.verificationId]);
    // An acknowledgement lost AFTER a successful native commit is genuinely PENDING;
    // it is not an unconfirmed update. No automatic retry or delivery claim is made.
    assert.equal(row.status,mode==='after-commit'?'PENDING':'SENDING');
    assert.equal(attempted,1);assert.deepEqual(events,['delivery_failed','revocation_failed']);
    if(mode==='before-commit'){assert.equal(f.stats.confirmationCommits,1);assert.equal(f.stats.committedConfirmations,0);assert.equal(f.stats.rollbacks,1);}
    if(mode==='after-commit'){assert.equal(f.stats.confirmationCommits,1);assert.equal(f.stats.committedConfirmations,1);assert.equal(f.stats.rollbacks,1);}
    if(mode==='update'){assert.equal(f.stats.confirmationCommits,0);assert.equal(f.stats.rollbacks,1);}
    const [[user]]=await db.execute('SELECT status,email_verified_at FROM users WHERE id=?',[userIds[index]]);assert.equal(user.status,'PENDING_VERIFICATION');assert.equal(user.email_verified_at,null);
   }catch(e){throw Error(`Isolated fault case failed (${/^[A-Z0-9_]+$/.test(e.code??'')?e.code:'CHECK_FAILED'}); no private values exposed`);}
   finally{if(service)await service.close();await f.database.close();}
  });
  for(const table of ['credit_transactions','auth_sessions']){const [[empty]]=await db.execute(`SELECT COUNT(*) AS total FROM ${table} WHERE user_id IN (?,?,?,?)`,userIds);assert.equal(empty.total,0);}
 }catch(e){throw Error(`Isolated fault integration failed (${/^[A-Z0-9_]+$/.test(e.code??'')?e.code:'CHECK_FAILED'}); no private values exposed`);}
 finally{
  if(db){try{if(created)await db.transaction(async tx=>{
   for(const email of emails){await tx.execute('DELETE FROM otp_request_limits WHERE email_hmac=?',[identifier(email)]);await tx.execute('DELETE FROM email_verifications WHERE user_id IN (SELECT id FROM users WHERE email=?)',[email]);await tx.execute('DELETE FROM student_profiles WHERE user_id IN (SELECT id FROM users WHERE email=?)',[email]);await tx.execute('DELETE FROM users WHERE email=?',[email]);}
   await tx.execute('DELETE FROM career_cycles WHERE career_id=?',[career]);await tx.execute('DELETE FROM careers WHERE id=?',[career]);
  });}catch{throw Error('Isolated fault fixture cleanup failed');}finally{await db.close();}}
 }
});
