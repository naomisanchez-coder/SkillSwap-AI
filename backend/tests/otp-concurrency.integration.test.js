import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createDatabase} from '../src/config/db.js';
import {createEmailRateRepository} from '../src/modules/auth/email-rate.repository.js';
const enabled=process.env.OTP_TEST_SCHEMA_002==='yes'&&Boolean(process.env.DATABASE_TEST_DB);
function restartedProcess(id){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[fileURLToPath(new URL('./helpers/otp-rate-worker.js',import.meta.url))],{
   env:{PATH:process.env.PATH,DATABASE_TEST_DB:process.env.DATABASE_TEST_DB,DATABASE_TEST_USER:process.env.DATABASE_TEST_USER,DATABASE_TEST_PASSWORD:process.env.DATABASE_TEST_PASSWORD},stdio:['pipe','pipe','pipe'],
  });let output='';child.stdout.on('data',d=>output+=d);child.stderr.resume();
  child.on('error',()=>reject(Error('Isolated restart worker unavailable')));
  child.on('exit',code=>{if(code!==0)return reject(Error('Isolated restart worker failed'));try{resolve(JSON.parse(output));}catch{reject(Error('Invalid isolated worker result'));}});
  child.stdin.end(JSON.stringify({id:id.toString('hex')}));
 });
}
test('real MySQL: independent connections, persisted unknown-email quota across process restart and sliding window',{
 skip:enabled?false:'002 isolated integration not enabled',timeout:30000,
},async()=>{
 let first,second;const id=randomBytes(32);
 try{
  assert.equal(process.env.DATABASE_TEST_DB,'skillswap_ai_test_auth');assert.equal(process.env.DATABASE_TEST_USER,'skillswap_test_app');
  const config={host:'127.0.0.1',port:3306,database:process.env.DATABASE_TEST_DB,user:process.env.DATABASE_TEST_USER,password:process.env.DATABASE_TEST_PASSWORD};
  first=createDatabase(config);second=createDatabase(config);
  const [[a]]=await first.execute('SELECT CURRENT_USER() AS account,CONNECTION_ID() AS connection');
  const [[b]]=await second.execute('SELECT CURRENT_USER() AS account,CONNECTION_ID() AS connection');
  assert.equal(a.account,'skillswap_test_app@127.0.0.1');assert.equal(b.account,a.account);assert.notEqual(a.connection,b.connection);
  const repo1=createEmailRateRepository(first),repo2=createEmailRateRepository(second);
  const admissions=await Promise.all(Array.from({length:8},(_,i)=>(i%2?repo1:repo2).take(id)));
  assert.equal(admissions.filter(r=>r.allowed).length,1);assert.ok(admissions.filter(r=>!r.allowed).every(r=>r.retryAfter>0&&r.retryAfter<=60));
  await first.close();first=undefined;
  const restarted=await restartedProcess(id);assert.equal(restarted.allowed,false);assert.ok(restarted.retryAfter>0&&restarted.retryAfter<=60);
  const age=()=>second.execute('UPDATE otp_request_limits SET request_1_at=DATE_SUB(request_1_at,INTERVAL 90 SECOND),request_2_at=DATE_SUB(request_2_at,INTERVAL 90 SECOND),request_3_at=DATE_SUB(request_3_at,INTERVAL 90 SECOND),request_4_at=DATE_SUB(request_4_at,INTERVAL 90 SECOND),request_5_at=DATE_SUB(request_5_at,INTERVAL 90 SECOND) WHERE email_hmac=?',[id]);
  for(let i=0;i<4;i++){await age();assert.equal((await repo2.take(id)).allowed,true);}
  await age();const capped=await restartedProcess(id);assert.equal(capped.allowed,false);assert.ok(capped.retryAfter>3000&&capped.retryAfter<=3600);
  const [[clock]]=await second.execute('SELECT UTC_TIMESTAMP(6) AS now');
  const times=[3601,300,240,180,120].map(seconds=>new Date(clock.now.getTime()-seconds*1000));
  await second.execute('UPDATE otp_request_limits SET request_1_at=?,request_2_at=?,request_3_at=?,request_4_at=?,request_5_at=? WHERE email_hmac=?',[...times,id]);
  assert.equal((await repo2.take(id)).allowed,true);
  const [[row]]=await second.execute('SELECT request_1_at,request_5_at FROM otp_request_limits WHERE email_hmac=?',[id]);
  assert.equal(row.request_1_at.getTime(),times[1].getTime());assert.ok(row.request_5_at>=clock.now);
  await assert.rejects(second.execute('INSERT INTO otp_request_limits (email_hmac) VALUES (?)',[randomBytes(31)]),e=>e.code==='ER_CHECK_CONSTRAINT_VIOLATED');
  await assert.rejects(second.execute('UPDATE otp_request_limits SET request_1_at=NULL,request_2_at=UTC_TIMESTAMP(6) WHERE email_hmac=?',[id]),e=>e.code==='ER_CHECK_CONSTRAINT_VIOLATED');
 }catch(e){throw Error(`Isolated quota integration failed (${/^[A-Z0-9_]+$/.test(e.code??'')?e.code:'CHECK_FAILED'}); no bindings exposed`);}
 finally{
  try{if(second)await second.execute('DELETE FROM otp_request_limits WHERE email_hmac=?',[id]);}
  catch{throw Error('Isolated quota fixture cleanup failed');}
  finally{if(first)await first.close();if(second)await second.close();}
 }
});
