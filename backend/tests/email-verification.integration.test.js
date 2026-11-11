import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createDatabase } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { createCodeProtection } from '../src/modules/auth/email-code.js';
import { createEmailVerificationRepository } from '../src/modules/auth/email-verification.repository.js';
import { createEmailVerificationService } from '../src/modules/auth/email-verification.service.js';
import { hashPassword } from '../src/modules/auth/password.service.js';

const requested=Object.keys(process.env).some(key=>key.startsWith('DATABASE_TEST_'));
test('real isolated verification is atomic, bounded, idempotent and concurrent-safe',{
  skip:requested?false:'isolated MySQL verification integration pending',timeout:60000,
},async()=>{
  let db,server,created=false;const careerId=randomUUID();const fixtures=[];
  const protection=createCodeProtection({keyHex:randomBytes(32).toString('hex'),keyVersion:'integration-v1',digits:6});
  const letters=()=>[...randomBytes(12)].map(n=>String.fromCharCode(97+n%26)).join('');
  const makeEmail=()=>letters()+'.'+letters()+'@tecsup.edu.pe';
  const makeCode=()=>String(randomInt(0,1000000)).padStart(6,'0');
  try{
    assert.equal(process.env.DATABASE_TEST_DB,'skillswap_ai_test_auth');assert.equal(process.env.DATABASE_TEST_USER,'skillswap_test_app');assert.ok(process.env.DATABASE_TEST_PASSWORD);
    db=createDatabase({host:'127.0.0.1',port:3306,database:process.env.DATABASE_TEST_DB,user:process.env.DATABASE_TEST_USER,password:process.env.DATABASE_TEST_PASSWORD});
    const [[identity]]=await db.execute('SELECT CURRENT_USER() AS account,DATABASE() AS db');assert.equal(identity.account,'skillswap_test_app@127.0.0.1');assert.equal(identity.db,'skillswap_ai_test_auth');
    const passwordHash=await hashPassword(randomBytes(24).toString('hex'));
    await db.transaction(async tx=>{await tx.execute('INSERT INTO careers (id,code,name) VALUES (?,?,?)',[careerId,'VERIFY_'+careerId,'Verificación aislada']);await tx.execute('INSERT INTO career_cycles (career_id,cycle) VALUES (?,?)',[careerId,2]);});created=true;
    async function fixture({status='PENDING',attempts=0,expired=false}={}){
      const item={userId:randomUUID(),id:randomUUID(),email:makeEmail(),code:makeCode(),status};fixtures.push(item);
      const createdAt=expired?new Date(Date.now()-700000):new Date(Date.now()-1000);
      const expiresAt=expired?new Date(Date.now()-100000):new Date(Date.now()+600000);
      const consumedAt=status==='CONSUMED'?new Date():null;
      await db.transaction(async tx=>{await tx.execute('INSERT INTO users (id,first_name,last_name,email,password_hash,status,terms_accepted_at,terms_version,privacy_version,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[item.userId,'Prueba','Aislada',item.email,passwordHash,'PENDING_VERIFICATION',new Date(),'test','test',createdAt]);await tx.execute('INSERT INTO student_profiles (user_id,career_id,cycle) VALUES (?,?,?)',[item.userId,careerId,2]);await tx.execute('INSERT INTO email_verifications (id,user_id,code_hmac,hmac_key_version,status,attempts,max_attempts,expires_at,consumed_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[item.id,item.userId,protection.digest({id:item.id,email:item.email,code:item.code}),protection.keyVersion,status,attempts,5,expiresAt,consumedAt,createdAt]);});return item;
    }
    const repository=createEmailVerificationRepository(db);const service=createEmailVerificationService(repository,protection);
    const verify=item=>service.verify({email:item.email,verificationId:item.id,code:item.code});
    const invalid=promise=>assert.rejects(promise,error=>error.code==='VERIFICATION_INVALID');

    const success=await fixture();server=createApp({database:db,origins:['http://localhost:5173'],verificationService:service}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/auth/email/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:success.email,verificationId:success.id,code:success.code})});
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'verified',initialCreditsGranted:true,creditsGranted:20,nextAction:'login'});
    const [[active]]=await db.execute('SELECT status,email_verified_at FROM users WHERE id=?',[success.userId]);assert.equal(active.status,'ACTIVE');assert.ok(active.email_verified_at);
    const [[consumed]]=await db.execute('SELECT status,consumed_at FROM email_verifications WHERE id=?',[success.id]);assert.equal(consumed.status,'CONSUMED');assert.ok(consumed.consumed_at);
    const [[grant]]=await db.execute('SELECT amount,reason,verification_id,operation_reference FROM credit_transactions WHERE user_id=?',[success.userId]);assert.equal(grant.amount,20);assert.equal(grant.reason,'INITIAL_EMAIL_VERIFICATION');assert.equal(grant.verification_id,success.id);assert.match(grant.operation_reference,/^initial-email-verification:/);
    const [[noSession]]=await db.execute('SELECT COUNT(*) AS total FROM auth_sessions WHERE user_id=?',[success.userId]);assert.equal(Number(noSession.total),0);await invalid(verify(success));
    const [[oneGrant]]=await db.execute('SELECT COUNT(*) AS total FROM credit_transactions WHERE user_id=?',[success.userId]);assert.equal(Number(oneGrant.total),1);

    const wrong=await fixture();await invalid(service.verify({email:wrong.email,verificationId:wrong.id,code:wrong.code==='000000'?'999999':'000000'}));let [[row]]=await db.execute('SELECT attempts,status FROM email_verifications WHERE id=?',[wrong.id]);assert.equal(row.attempts,1);assert.equal(row.status,'PENDING');
    const exhausted=await fixture({attempts:4});await invalid(service.verify({email:exhausted.email,verificationId:exhausted.id,code:exhausted.code==='111111'?'222222':'111111'}));[[row]]=await db.execute('SELECT attempts,status FROM email_verifications WHERE id=?',[exhausted.id]);assert.equal(row.attempts,5);assert.equal(row.status,'EXHAUSTED');await invalid(verify(exhausted));
    const expired=await fixture({expired:true});await invalid(verify(expired));[[row]]=await db.execute('SELECT status FROM email_verifications WHERE id=?',[expired.id]);assert.equal(row.status,'EXPIRED');
    for(const status of ['REVOKED','SENDING','CONSUMED']){const item=await fixture({status});await invalid(verify(item));}
    const owner=await fixture();const other=await fixture();await invalid(service.verify({email:other.email,verificationId:owner.id,code:owner.code}));[[row]]=await db.execute('SELECT attempts FROM email_verifications WHERE id=?',[owner.id]);assert.equal(row.attempts,0);

    const concurrent=await fixture();const raced=await Promise.allSettled([verify(concurrent),verify(concurrent)]);assert.equal(raced.filter(result=>result.status==='fulfilled').length,1);assert.equal(raced.filter(result=>result.status==='rejected'&&result.reason.code==='VERIFICATION_INVALID').length,1);const [[concurrentGrant]]=await db.execute('SELECT COUNT(*) AS total FROM credit_transactions WHERE user_id=?',[concurrent.userId]);assert.equal(Number(concurrentGrant.total),1);

    const faultDatabase=needle=>({transaction:work=>db.transaction(tx=>work({execute(sql,values){if(sql.startsWith(needle))throw Error('Injected transactional failure');return tx.execute(sql,values);}}))});
    for(const needle of ["UPDATE users SET status = 'ACTIVE'",'INSERT INTO credit_transactions']){const item=await fixture();const faulty=createEmailVerificationService(createEmailVerificationRepository(faultDatabase(needle)),protection);await assert.rejects(faulty.verify({email:item.email,verificationId:item.id,code:item.code}),error=>error.code==='SERVICE_UNAVAILABLE');const [[user]]=await db.execute('SELECT status,email_verified_at FROM users WHERE id=?',[item.userId]);assert.equal(user.status,'PENDING_VERIFICATION');assert.equal(user.email_verified_at,null);const [[challenge]]=await db.execute('SELECT status,consumed_at FROM email_verifications WHERE id=?',[item.id]);assert.equal(challenge.status,'PENDING');assert.equal(challenge.consumed_at,null);const [[credits]]=await db.execute('SELECT COUNT(*) AS total FROM credit_transactions WHERE user_id=?',[item.userId]);assert.equal(Number(credits.total),0);}
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    if(db){try{if(created)await db.transaction(async tx=>{const ids=fixtures.map(item=>item.userId);if(ids.length){const placeholders=ids.map(()=>'?').join(',');await tx.execute('DELETE FROM auth_sessions WHERE user_id IN ('+placeholders+')',ids);await tx.execute('DELETE FROM credit_transactions WHERE user_id IN ('+placeholders+')',ids);await tx.execute('DELETE FROM email_verifications WHERE user_id IN ('+placeholders+')',ids);await tx.execute('DELETE FROM student_profiles WHERE user_id IN ('+placeholders+')',ids);await tx.execute('DELETE FROM users WHERE id IN ('+placeholders+')',ids);}await tx.execute('DELETE FROM career_cycles WHERE career_id=?',[careerId]);await tx.execute('DELETE FROM careers WHERE id=?',[careerId]);});}catch{throw Error('Isolated verification fixture cleanup failed');}finally{await db.close();}}
  }
});
