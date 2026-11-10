import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createDatabase} from '../src/config/db.js';
import {createEmailRepository} from '../src/modules/auth/email.repository.js';
import {createEmailService} from '../src/modules/auth/email.service.js';
import {createCodeProtection} from '../src/modules/auth/email-code.js';
import {hashPassword} from '../src/modules/auth/password.service.js';
import {createApp} from '../src/app.js';
const policy={ttlSeconds:600,cooldownSeconds:60,windowSeconds:3600,maxPerWindow:5,maxAttempts:5};
const requested=Object.keys(process.env).some(k=>k.startsWith('DATABASE_TEST_'));
test('real isolated OTP: locks, protected storage, expiry, resend caps, SMTP compensation and public HTTP',{
  skip:requested?false:'Isolated DML credentials not configured',timeout:60000,
},async()=>{
  let db,server,service;let created=false;
  const career=randomUUID();const ids=Array.from({length:5},()=>randomUUID());
  const emails=ids.map(()=>`test.${[...randomBytes(18)].map(n=>String.fromCharCode(97+n%26)).join('')}@tecsup.edu.pe`);
  try{
    assert.equal(process.env.DATABASE_TEST_DB,'skillswap_ai_test_auth');assert.equal(process.env.DATABASE_TEST_USER,'skillswap_test_app');
    db=createDatabase({host:'127.0.0.1',port:3306,database:process.env.DATABASE_TEST_DB,user:process.env.DATABASE_TEST_USER,password:process.env.DATABASE_TEST_PASSWORD});
    const [[identity]]=await db.execute('SELECT CURRENT_USER() AS account,DATABASE() AS db,CURRENT_ROLE() AS roles');
    assert.equal(identity.account,'skillswap_test_app@127.0.0.1');assert.equal(identity.db,'skillswap_ai_test_auth');assert.equal(identity.roles,'NONE');
    const hash=await hashPassword(randomBytes(24).toString('hex'));
    await db.transaction(async tx=>{
      await tx.execute('INSERT INTO careers (id,code,name) VALUES (?,?,?)',[career,`OTP_${career}`,`OTP fixture ${career}`]);
      await tx.execute('INSERT INTO career_cycles (career_id,cycle) VALUES (?,?)',[career,3]);
      for(let i=0;i<ids.length;i++){
        await tx.execute(`INSERT INTO users (id,first_name,last_name,email,password_hash,status,email_verified_at,terms_accepted_at,terms_version,privacy_version,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[ids[i],'Prueba','Aislada',emails[i],hash,i===1?'ACTIVE':i===2?'DISABLED':'PENDING_VERIFICATION',i===1?new Date():null,new Date(),'isolated-test','isolated-test',new Date(Date.now()-1000)]);
        await tx.execute('INSERT INTO student_profiles (user_id,career_id,cycle) VALUES (?,?,?)',[ids[i],career,3]);
      }
    });created=true;
    const repo=createEmailRepository(db);
    const protection=createCodeProtection({keyHex:randomBytes(32).toString('hex'),keyVersion:'isolated-v1',digits:6});
    const reserve=(email=emails[0])=>{const id=randomUUID();const code=protection.generate();return repo.reserve({id,email,digest:protection.digest({id,email,code}),keyVersion:protection.keyVersion,policy});};
    for(const email of ['cuenta.ausente@tecsup.edu.pe',emails[1],emails[2]])assert.equal(await reserve(email),null);
    const concurrent=await Promise.all([reserve(),reserve(),reserve()]);assert.equal(concurrent.filter(Boolean).length,1);
    let [rows]=await db.execute('SELECT id,code_hmac,hmac_key_version,status,attempts,max_attempts,created_at,expires_at FROM email_verifications WHERE user_id=?',[ids[0]]);
    assert.equal(rows.length,1);assert.equal(rows[0].code_hmac.length,32);assert.equal(rows[0].hmac_key_version,'isolated-v1');
    assert.equal(rows[0].status,'PENDING');assert.equal(rows[0].attempts,0);assert.equal(rows[0].max_attempts,5);
    assert.equal(rows[0].expires_at.getTime()-rows[0].created_at.getTime(),600000);
    const first=rows[0].id;
    await db.execute('UPDATE email_verifications SET created_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 90 SECOND) WHERE user_id=?',[ids[0]]);
    assert.ok(await reserve());
    const [[revoked]]=await db.execute('SELECT status FROM email_verifications WHERE id=?',[first]);assert.equal(revoked.status,'REVOKED');
    await db.execute("UPDATE email_verifications SET created_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 700 SECOND),expires_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 SECOND) WHERE user_id=? AND status='PENDING'",[ids[0]]);
    assert.ok(await reserve());
    const [[expired]]=await db.execute("SELECT COUNT(*) AS total FROM email_verifications WHERE user_id=? AND status='EXPIRED'",[ids[0]]);assert.equal(expired.total,1);
    for(let i=0;i<2;i++){
      await db.execute('UPDATE email_verifications SET created_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 90 SECOND) WHERE user_id=?',[ids[0]]);
      assert.ok(await reserve());
    }
    await db.execute('UPDATE email_verifications SET created_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 90 SECOND) WHERE user_id=?',[ids[0]]);
    assert.equal(await reserve(),null);
    const [[cap]]=await db.execute('SELECT COUNT(*) AS total FROM email_verifications WHERE user_id=?',[ids[0]]);assert.equal(cap.total,5);
    // Adapter is explicitly substituted: no message leaves this process.
    const sent=[];const events=[];
    service=createEmailService({policy,protection,repository:repo,onEvent:event=>events.push(event),mailer:{async sendVerification(message){
      assert.ok(message.expiresAt>Date.now());
      // A new connection can lock the user now: SMTP holds no transaction/user lock.
      await db.transaction(async tx=>{await tx.execute('SELECT id FROM users WHERE email=? FOR UPDATE',[message.to]);});
      if(message.to===emails[3])throw Error('Synthetic transport failure');
      sent.push(message);
    }}});
    assert.equal((await service.request({email:emails[3]})).status,'accepted');await service.idle();
    const [[failed]]=await db.execute('SELECT status FROM email_verifications WHERE user_id=?',[ids[3]]);assert.equal(failed.status,'REVOKED');assert.ok(events.includes('delivery_failed'));
    server=createApp({database:db,origins:['http://localhost:5173'],emailService:service}).listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    const post=email=>fetch(`${base}/api/auth/email/send-code`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
    for(const email of [emails[0],emails[1],emails[2],'cuenta.ausente@tecsup.edu.pe']){
      const response=await post(email);assert.equal(response.status,202);const body=await response.json();
      assert.deepEqual(Object.keys(body).sort(),['message','status','verificationId']);assert.equal(body.status,'accepted');
    }
    const raced=await Promise.all([post(emails[4]),post(emails[4])]);assert.deepEqual(raced.map(r=>r.status).sort(),[202,429]);
    await service.idle();assert.equal(sent.length,1);assert.equal(sent[0].to,emails[4]);
    const [[stored]]=await db.execute('SELECT id,code_hmac FROM email_verifications WHERE user_id=?',[ids[4]]);
    assert.deepEqual(stored.code_hmac,protection.digest({id:stored.id,email:emails[4],code:sent[0].code}));
    // A real CHECK failure after revoking the old row must roll the whole issuance back.
    await db.execute('UPDATE email_verifications SET created_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 90 SECOND) WHERE user_id=?',[ids[4]]);
    await assert.rejects(repo.reserve({id:randomUUID(),email:emails[4],digest:Buffer.alloc(1),keyVersion:'test',policy}),e=>e.code==='ER_CHECK_CONSTRAINT_VIOLATED');
    const [[preserved]]=await db.execute('SELECT status FROM email_verifications WHERE id=?',[stored.id]);
    assert.equal(preserved.status,'PENDING');
    const [[single]]=await db.execute('SELECT COUNT(*) AS total FROM email_verifications WHERE user_id=?',[ids[4]]);assert.equal(single.total,1);
    for(const table of ['auth_sessions','credit_transactions']){
      const [[empty]]=await db.execute(`SELECT COUNT(*) AS total FROM ${table} WHERE user_id IN (?,?,?,?,?)`,ids);assert.equal(empty.total,0);
    }
    assert.equal((await fetch(`${base}/api/health/db`)).status,200);
  }catch(error){throw new Error(`Isolated OTP verification failed (${/^[A-Z0-9_]+$/.test(error.code??'')?error.code:'CHECK_FAILED'}); no private values exposed`);}
  finally{
    if(server)await new Promise(resolve=>server.close(resolve));if(service)await service.close();
    if(db){try{if(created)await db.transaction(async tx=>{
      await tx.execute('DELETE FROM email_verifications WHERE user_id IN (?,?,?,?,?)',ids);
      await tx.execute('DELETE FROM student_profiles WHERE user_id IN (?,?,?,?,?)',ids);
      await tx.execute('DELETE FROM users WHERE id IN (?,?,?,?,?)',ids);
      await tx.execute('DELETE FROM career_cycles WHERE career_id=?',[career]);
      await tx.execute('DELETE FROM careers WHERE id=?',[career]);
    });}finally{await db.close();}}
  }
});
