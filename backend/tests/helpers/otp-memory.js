// Unit-only SQL model. It is not MySQL and cannot validate DDL, isolation or locks.
const clone = value => Buffer.isBuffer(value) ? Buffer.from(value) : value instanceof Date ? new Date(value) :
  Array.isArray(value) ? value.map(clone) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clone(v)])) : value;
export function otpMemory() {
  const state = { now: Date.now(), users: new Map(), limits: new Map(), challenges: new Map(), fail: new Set(), commands: [] };
  let chain = Promise.resolve();
  async function execute(sql, v=[]) {
    state.commands.push(sql);
    if (sql.startsWith('SELECT version FROM schema_migrations')) return [[{version:'002_otp_delivery_safety'}]];
    if (sql.startsWith('SELECT UTC_TIMESTAMP')) return [[{now:new Date(state.now)}]];
    if (sql.startsWith('INSERT INTO otp_request_limits')) {
      const key=v[0].toString('hex');if(!state.limits.has(key))state.limits.set(key,{email_hmac:Buffer.from(v[0]),...Object.fromEntries(Array.from({length:5},(_,i)=>[`request_${i+1}_at`,null]))});return [{}];
    }
    if (sql.startsWith('SELECT request_1_at')) return [[state.limits.get(v[0].toString('hex'))]];
    if (sql.startsWith('UPDATE otp_request_limits')) {
      const row=state.limits.get(v[5].toString('hex'));for(let i=0;i<5;i++)row[`request_${i+1}_at`]=v[i];return [{affectedRows:1}];
    }
    if (sql.startsWith('SELECT user_id FROM email_verifications')) return [state.challenges.has(v[0])?[{user_id:state.challenges.get(v[0]).user_id}]:[]];
    if (sql.startsWith('SELECT id, email, role')) return [[...state.users.values()].filter(u=>u.email===v[0])];
    if (sql.startsWith('SELECT id, role')) return [state.users.has(v[0])?[state.users.get(v[0])]:[]];
    if (sql.startsWith('UPDATE email_verifications SET status = CASE')) {
      for(const row of state.challenges.values())if(row.user_id===v[1]&&['SENDING','PENDING'].includes(row.status))row.status=row.expires_at<=v[0]?'EXPIRED':'REVOKED';return [{}];
    }
    if (sql.startsWith('INSERT INTO email_verifications')) {
      if(state.fail.has('insert'))throw Error('Synthetic insert failure');
      state.challenges.set(v[0],{id:v[0],user_id:v[1],code_hmac:Buffer.from(v[2]),hmac_key_version:v[3],max_attempts:v[4],expires_at:v[5],created_at:v[6],status:'SENDING',attempts:0});return [{}];
    }
    if (sql.startsWith("UPDATE email_verifications SET status = 'PENDING'")) {
      if(state.fail.has('confirm'))throw Error('Synthetic confirmation failure');
      const row=state.challenges.get(v[0]);const allowed=row&&row.user_id===v[1]&&row.status==='SENDING'&&row.expires_at.getTime()>state.now;
      if(allowed)row.status='PENDING';return [{affectedRows:allowed?1:0}];
    }
    if (sql.startsWith("UPDATE email_verifications SET status = 'REVOKED'")) {
      if(state.fail.has('revoke'))throw Error('Synthetic revocation failure');const row=state.challenges.get(v[0]);if(row&&['SENDING','PENDING'].includes(row.status))row.status='REVOKED';return [{}];
    }
    throw Error('Unexpected unit-model statement');
  }
  const database={check:async()=>{},async transaction(work){
    const previous=chain;let release;chain=new Promise(resolve=>{release=resolve;});await previous;
    const before=Object.fromEntries(['users','limits','challenges'].map(k=>[k,new Map([...state[k]].map(([id,row])=>[id,clone(row)]))]));
    try{return await work({execute});}catch(error){Object.assign(state,before);throw error;}finally{release();}
  },execute:(sql,v)=>database.transaction(tx=>tx.execute(sql,v))};
  return {state,database};
}
