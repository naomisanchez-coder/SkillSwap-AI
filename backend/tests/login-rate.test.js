import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readLoginSecurityConfig, loginRatePolicy } from '../src/config/login-security.js';
import { createLoginRateIdentifiers } from '../src/modules/auth/login-rate.js';
import { createLoginRateRepository } from '../src/modules/auth/login-rate.repository.js';

const key=()=>randomBytes(32).toString('hex');

test('login security requires an independent 32-byte HMAC key and explicit trusted proxy hops',()=>{
  const login=key(),otp=key(),rate=key(),csrf=key();
  const config=readLoginSecurityConfig({LOGIN_RATE_HMAC_KEY_HEX:login,OTP_HMAC_KEY_HEX:otp,
    OTP_RATE_HMAC_KEY_HEX:rate,SESSION_CSRF_KEY_HEX:csrf,TRUST_PROXY_HOPS:'0'});
  assert.equal(config.trustProxyHops,0);assert.deepEqual(config.policy,loginRatePolicy);
  for(const value of ['',key().slice(2),'z'.repeat(64)])assert.throws(()=>readLoginSecurityConfig({LOGIN_RATE_HMAC_KEY_HEX:value}));
  for(const reused of [otp,rate,csrf])assert.throws(()=>readLoginSecurityConfig({LOGIN_RATE_HMAC_KEY_HEX:reused,OTP_HMAC_KEY_HEX:reused}));
  for(const hops of ['-1','1.5','11','yes'])assert.throws(()=>readLoginSecurityConfig({LOGIN_RATE_HMAC_KEY_HEX:login,TRUST_PROXY_HOPS:hops}));
});

test('EMAIL and IP identifiers are stable, separated and never contain the source value',()=>{
  const identifiers=createLoginRateIdentifiers(key());
  const email=identifiers.email('prueba.aislada@tecsup.edu.pe');
  const same=identifiers.email('prueba.aislada@tecsup.edu.pe');
  const ip=identifiers.ip('127.0.0.1');
  assert.equal(email.length,32);assert.deepEqual(email,same);assert.notDeepEqual(email,ip);
  assert.equal(email.includes(Buffer.from('prueba.aislada')),false);
  assert.throws(()=>identifiers.email(' PRUEBA@TECSUP.EDU.PE '));assert.throws(()=>identifiers.ip('127.0.0.1\n'));
});

function memoryDatabase(start=new Date('2026-01-01T00:00:00.000Z')){
  const state={now:start,rows:new Map(),queries:[],cleanup:0};let queue=Promise.resolve();
  const id=(scope,value)=>scope+':'+value.toString('hex');
  const tx={async execute(sql,values=[]){state.queries.push(sql);
    if(sql.startsWith('SELECT UTC_TIMESTAMP'))return [[{now:new Date(state.now)}]];
    if(sql.startsWith('INSERT INTO login_rate_limits')){const [scope,identifier,window,expires]=values;const k=id(scope,identifier);if(!state.rows.has(k))state.rows.set(k,{scope,identifier_hmac:Buffer.from(identifier),window_started_at:new Date(window),expires_at:new Date(expires),attempts:0});return [{affectedRows:1}];}
    if(sql.startsWith('SELECT scope,attempts')){const [scope,identifier]=values;const row=state.rows.get(id(scope,identifier));return [[row?{...row,window_started_at:new Date(row.window_started_at),expires_at:new Date(row.expires_at)}:undefined]];}
    if(sql.includes('SET window_started_at=')){const [window,expires,scope,identifier]=values;const row=state.rows.get(id(scope,identifier));if(!row)return [{affectedRows:0}];Object.assign(row,{window_started_at:new Date(window),expires_at:new Date(expires),attempts:0});return [{affectedRows:1}];}
    if(sql.includes('SET attempts=attempts+1')){const [scope,identifier]=values;const row=state.rows.get(id(scope,identifier));if(!row)return [{affectedRows:0}];row.attempts++;return [{affectedRows:1}];}
    throw Error('Unexpected simulated SQL');
  }};
  return {state,transaction(work){const run=queue.then(()=>work(tx));queue=run.catch(()=>{});return run;},async execute(sql,values=[]){state.queries.push(sql);if(!sql.startsWith('DELETE FROM login_rate_limits'))throw Error('Unexpected cleanup SQL');const cutoff=values[0];let removed=0;for(const [k,row] of state.rows){if(removed>=100)break;if(row.expires_at<cutoff){state.rows.delete(k);removed++;}}state.cleanup+=removed;return[{affectedRows:removed}];}};
}

test('fixed EMAIL window admits five attempts, never extends a block and resets after 15 minutes',async()=>{
  const database=memoryDatabase();const ids=createLoginRateIdentifiers(key());const repository=createLoginRateRepository(database);
  const input={emailHmac:ids.email('prueba.aislada@tecsup.edu.pe'),ipHmac:ids.ip('127.0.0.1')};
  for(let i=0;i<5;i++)assert.deepEqual(await repository.take(input),{allowed:true});
  const expiry=[...database.state.rows.values()].find(row=>row.scope==='EMAIL').expires_at.getTime();
  assert.deepEqual(await repository.take(input),{allowed:false,retryAfter:900});
  database.state.now=new Date(database.state.now.getTime()+60000);
  assert.deepEqual(await repository.take(input),{allowed:false,retryAfter:840});
  assert.equal([...database.state.rows.values()].find(row=>row.scope==='EMAIL').expires_at.getTime(),expiry);
  database.state.now=new Date(expiry);assert.deepEqual(await repository.take(input),{allowed:true});
  assert.equal([...database.state.rows.values()].find(row=>row.scope==='EMAIL').attempts,1);
});

test('IP limit is twenty across emails and concurrent requests cannot exceed the email limit',async()=>{
  const database=memoryDatabase();const ids=createLoginRateIdentifiers(key());const repository=createLoginRateRepository(database);
  const ipHmac=ids.ip('127.0.0.1');
  for(let i=0;i<20;i++)assert.equal((await repository.take({emailHmac:ids.email('user'+i+'@example.invalid'),ipHmac})).allowed,true);
  assert.equal((await repository.take({emailHmac:ids.email('blocked@example.invalid'),ipHmac})).allowed,false);
  const other=memoryDatabase();const concurrent=createLoginRateRepository(other);const same={emailHmac:ids.email('same@example.invalid'),ipHmac:ids.ip('::1')};
  const results=await Promise.all(Array.from({length:10},()=>concurrent.take(same)));
  assert.equal(results.filter(result=>result.allowed).length,5);assert.equal(results.filter(result=>!result.allowed).length,5);
  assert.equal([...other.state.rows.values()].find(row=>row.scope==='EMAIL').attempts,5);
});

test('expired pseudonymous rows are cleaned in bounded batches after 24-hour retention',async()=>{
  const database=memoryDatabase();const ids=createLoginRateIdentifiers(key());const repository=createLoginRateRepository(database);
  await repository.take({emailHmac:ids.email('old@example.invalid'),ipHmac:ids.ip('127.0.0.2')});
  database.state.now=new Date(database.state.now.getTime()+loginRatePolicy.retentionSeconds*1000+loginRatePolicy.windowSeconds*1000+1);
  assert.equal(await repository.cleanupExpired(database.state.now),2);assert.equal(database.state.rows.size,0);
  assert.ok(database.state.queries.at(-1).includes('LIMIT 100'));
});
