import test from 'node:test';
import assert from 'node:assert/strict';
import {readMigration,readMigrations,latestMigration,runMigration,checkMigrationPrivileges} from '../database/migrate.js';
const all=await readMigrations(latestMigration);
const config={host:'127.0.0.1',port:3306,database:'skillswap_ai_test_auth',user:'isolated_migrator'};
const minimum={grant:'GRANT SELECT, INSERT, CREATE, REFERENCES ON `skillswap\\_ai\\_test\\_auth`.* TO `isolated_migrator`@`127.0.0.1`'};
const alter={grant:'GRANT ALTER ON `skillswap_ai_test_auth`.`email_verifications` TO `isolated_migrator`@`127.0.0.1`'};
function fake(initial=0){
 const state={history:all.slice(0,initial).map(m=>({version:m.version,checksum:m.checksum})),tables:new Set(),commands:[],fail:null,session:null,altered:initial>1};
 const creations=all.flatMap(m=>m.statements).filter(s=>s.startsWith('CREATE TABLE '));
 for(const m of all.slice(0,initial))for(const s of m.statements)if(s.startsWith('CREATE TABLE '))state.tables.add(s.match(/^CREATE TABLE ([a-z_]+)/)[1]);
 const connection={async query(sql){
  state.commands.push(sql);
  if(sql.startsWith('SELECT VERSION()'))return [[{version:'8.4.13',db:config.database,port:3306,account:'isolated_migrator@127.0.0.1',partialRevokes:0}]];
  if(sql.startsWith('SHOW GRANTS'))return [[minimum,alter]];
  if(sql.startsWith('SELECT COUNT(*) AS count FROM email_verifications'))return [[{count:0}]];
  if(sql.startsWith('SELECT version, checksum'))return [state.history];
  if(state.fail && sql.startsWith(state.fail))throw Object.assign(Error('Synthetic DDL failure'),{code:'ER_TEST_DDL'});
  if(sql.startsWith('CREATE TABLE '))state.tables.add(sql.match(/^CREATE TABLE ([a-z_]+)/)[1]);
  if(sql.startsWith('ALTER TABLE '))state.altered=true;
  if(sql.startsWith('INSERT INTO schema_migrations'))state.history.push({version:state.session[0],checksum:state.session[1]});
  return [[]];
 },async execute(sql,values=[]){
  state.commands.push(sql);
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('RELEASE_LOCK'))return [[{released:1}]];
  if(sql.startsWith('SET @')){state.session=values;return [[]];}
  if(sql.includes('information_schema.TABLES'))return [[...state.tables].sort().map(name=>({name,type:'BASE TABLE',engine:'InnoDB'}))];
  if(sql.includes('information_schema.ROUTINES'))return [[{count:0}]];
  if(sql.includes('COLUMN_DEFAULT'))return [[{value:state.altered?'SENDING':'PENDING'}]];
  if(sql.includes('CHECK_CLAUSE'))return [[{clause:state.altered?"status in ('SENDING','PENDING','CONSUMED','REVOKED','EXPIRED','EXHAUSTED')":"status in ('PENDING','CONSUMED','REVOKED','EXPIRED','EXHAUSTED')"}]];
  const statements=creations.filter(s=>state.tables.has(s.match(/^CREATE TABLE ([a-z_]+)/)[1]));
  if(sql.includes('information_schema.COLUMNS'))return [statements.flatMap(s=>[...s.matchAll(/^  ([a-z_][a-z0-9_]*) (CHAR\(\d+\)|VARCHAR\(\d+\)|VARBINARY\(\d+\)|DATETIME\(6\)|SMALLINT UNSIGNED|INT|BOOLEAN)/gm)].map(m=>({t:s.match(/^CREATE TABLE ([a-z_]+)/)[1],c:m[1],type:m[2].toLowerCase().replace('boolean','tinyint(1)')})))];
  if(sql.includes("CONSTRAINT_TYPE = 'CHECK'"))return [statements.flatMap(s=>[...s.matchAll(/CONSTRAINT ([a-z_]+) CHECK/g)].map(m=>({name:m[1],enforced:'YES'})))];
  if(sql.includes('information_schema.TABLE_CONSTRAINTS'))return [statements.flatMap(s=>['PRIMARY',...[...s.matchAll(/(?:CONSTRAINT|UNIQUE KEY) ([a-z_]+)/g)].map(m=>m[1])].map(name=>({t:s.match(/^CREATE TABLE ([a-z_]+)/)[1],name})))];
  throw Error('Unexpected unit-only migration query');
 }};
 return {state,connection};
}
test('002 is separate, contains only quota table/state ALTER/history and preserves approved 001 bytes',async()=>{
 assert.equal(all[0].checksum,'a544084c180a8c8ce701bd506bc98819d4e433b61460b1b20b7dbe4f0e1061c8');
 assert.equal(all[1].statements.length,5);assert.match(all[1].statements[2],/^CREATE TABLE otp_request_limits/);
 assert.match(all[1].statements[3],/^ALTER TABLE email_verifications/);assert.ok(!all[1].statements.some(s=>/^DROP TABLE|^DELETE |^UPDATE /.test(s)));
 assert.ok(!/\bemail\s+(?:VAR)?CHAR/i.test(all[1].statements[2]));
 assert.equal((await readMigration()).version,all[0].version);
 await assert.rejects(readMigrations('003_unknown'),e=>e.code==='MIGRATION_VERSION_INVALID');
});
test('002 privilege check requires exact table ALTER; schema/global/excess rights never substitute',()=>{
 checkMigrationPrivileges([minimum,alter],config.database,0,{requireAlter:true});
 assert.throws(()=>checkMigrationPrivileges([minimum],config.database,0,{requireAlter:true}),e=>e.code==='MIGRATION_PRIVILEGES_MISSING');
 for(const grant of ['GRANT ALTER ON `skillswap\\_ai\\_test\\_auth`.* TO `u`@`h`','GRANT ALTER ON *.* TO `u`@`h`','GRANT ALTER ON `skillswap_ai_test_auth`.`users` TO `u`@`h`'])assert.throws(()=>checkMigrationPrivileges([minimum,alter,{grant}],config.database,0,{requireAlter:true}));
});
test('unit-only runner inspects all pending migrations without DDL',async()=>{
 const f=fake();const result=await runMigration(f.connection,config,{through:latestMigration});
 assert.deepEqual(result.migrations.map(m=>m.state),['pending','pending','pending']);assert.equal(result.applied,false);
 assert.ok(f.state.commands.every(s=>/^(SELECT|SHOW)/.test(s)));
});
test('unit-only runner applies ordered 001/002/003 and a second run repeats none',async()=>{
 const f=fake();const opts={through:latestMigration,apply:true,allowDdl:true};
 assert.equal((await runMigration(f.connection,config,opts)).applied,true);
 assert.deepEqual(f.state.history,all.map(m=>({version:m.version,checksum:m.checksum})));
 const before=f.state.commands.filter(s=>/^CREATE |^ALTER |^INSERT INTO schema_migrations/.test(s)).length;
 assert.equal((await runMigration(f.connection,config,opts)).applied,false);
 assert.equal(f.state.commands.filter(s=>/^CREATE |^ALTER |^INSERT INTO schema_migrations/.test(s)).length,before);
});
test('unit-only runner upgrades applied 001 through 003 without recreating prior tables',async()=>{
 const f=fake(1);assert.equal((await runMigration(f.connection,config,{through:latestMigration,apply:true,allowDdl:true})).applied,true);
 assert.equal(f.state.commands.filter(s=>s.startsWith('CREATE TABLE')).length,2);
 assert.equal(f.state.commands.filter(s=>s.startsWith('INSERT INTO schema_migrations')).length,2);
});
test('unit-only failed ALTER leaves visible partial state, no 002 record and no automatic cleanup/retry',async()=>{
 const f=fake(1);f.state.fail='ALTER TABLE';
 await assert.rejects(runMigration(f.connection,config,{through:latestMigration,apply:true,allowDdl:true}),e=>e.code==='ER_TEST_DDL');
 assert.equal(f.state.history.length,1);assert.ok(f.state.tables.has('otp_request_limits'));assert.equal(f.state.altered,false);
 assert.ok(f.state.commands.at(-1).includes('RELEASE_LOCK'));
 await assert.rejects(runMigration(f.connection,config,{through:latestMigration}),e=>e.code==='MIGRATION_PARTIAL_OR_FOREIGN_SCHEMA');
 assert.ok(!f.state.commands.some(s=>/^DROP TABLE|^DELETE |^TRUNCATE/.test(s)));
});
test('history tampering and independent main checksums block application before DDL',async()=>{
 const f=fake(1);f.state.history[0].checksum='0'.repeat(64);
 await assert.rejects(runMigration(f.connection,config,{through:latestMigration}),e=>e.code==='MIGRATION_HISTORY_MISMATCH');
 const g=fake();await assert.rejects(runMigration(g.connection,{...config,database:'skillswap_ai'},{through:latestMigration,apply:true,allowDdl:true,validatedChecksum:all[0].checksum}),e=>e.code==='MIGRATION_ISOLATED_VALIDATION_REQUIRED');
 assert.equal(g.state.commands.length,0);
});
test('active legacy challenges stop 002 before DDL; both old and new checksums are required for main',async()=>{
 const f=fake(1);const query=f.connection.query.bind(f.connection);
 f.connection.query=async sql=>sql.startsWith('SELECT COUNT(*) AS count FROM email_verifications')?[[{count:1}]]:query(sql);
 await assert.rejects(runMigration(f.connection,config,{through:latestMigration,apply:true,allowDdl:true}),e=>e.code==='MIGRATION_LEGACY_REQUESTS_REVIEW_REQUIRED');
 assert.ok(!f.state.commands.some(s=>/^CREATE |^ALTER /.test(s)));
 for(const checksums of [{[all[0].version]:all[0].checksum},{[all[1].version]:all[1].checksum},Object.fromEntries(all.map(m=>[m.version,'0'.repeat(64)]))]){
  const g=fake();await assert.rejects(runMigration(g.connection,{...config,database:'skillswap_ai'},
   {through:latestMigration,apply:true,allowDdl:true,validatedChecksums:checksums}),e=>e.code==='MIGRATION_ISOLATED_VALIDATION_REQUIRED');assert.equal(g.state.commands.length,0);
 }
});
test('002 recorded checksum and actual state CHECK/default are verified independently',async()=>{
 const wrongHash=fake(2);wrongHash.state.history[1].checksum='0'.repeat(64);
 await assert.rejects(runMigration(wrongHash.connection,config,{through:latestMigration}),e=>e.code==='MIGRATION_HISTORY_MISMATCH');
 const wrongState=fake(2);wrongState.state.altered=false;
 await assert.rejects(runMigration(wrongState.connection,config,{through:latestMigration}),e=>e.code==='MIGRATION_STATUS_DEFAULT_MISMATCH');
});
test('MySQL 8.4 CHECK metadata charset/escaped quotes are recognized without accepting extra predicates',async()=>{
 for(const initial of [1,2]){
  const f=fake(initial);const execute=f.connection.execute.bind(f.connection);
  f.connection.execute=async(sql,v)=>sql.includes('CHECK_CLAUSE')?[[{clause:'(`status` in ('+
   [...(initial===2?['SENDING']:[]),'PENDING','CONSUMED','REVOKED','EXPIRED','EXHAUSTED'].map(s=>"_utf8mb4\\'"+s+"\\'").join(',')+'))'}]]:execute(sql,v);
  assert.equal((await runMigration(f.connection,config,{through:latestMigration})).applied,false);
 }
 const f=fake(1);const execute=f.connection.execute.bind(f.connection);
 f.connection.execute=async(sql,v)=>sql.includes('CHECK_CLAUSE')?[[{clause:"(status in ('PENDING','CONSUMED','REVOKED','EXPIRED','EXHAUSTED') OR 1=1)"}]]:execute(sql,v);
 await assert.rejects(runMigration(f.connection,config,{through:latestMigration}),e=>e.code==='MIGRATION_STATUS_CHECK_MISMATCH');
});
test('numeric column names are inspected: all five quota timestamps must exist',async()=>{
 const f=fake(2);const execute=f.connection.execute.bind(f.connection);
 const [columns]=await execute('SELECT columns FROM information_schema.COLUMNS');
 assert.deepEqual(columns.filter(c=>c.t==='otp_request_limits').map(c=>c.c),
  ['email_hmac','request_1_at','request_2_at','request_3_at','request_4_at','request_5_at','created_at','updated_at']);
 await runMigration(f.connection,config,{through:latestMigration});
 f.connection.execute=async(sql,v)=>{const result=await execute(sql,v);return sql.includes('information_schema.COLUMNS')&&!sql.includes('COLUMN_DEFAULT')?
  [result[0].filter(c=>!(c.t==='otp_request_limits'&&c.c==='request_3_at'))]:result;};
 await assert.rejects(runMigration(f.connection,config,{through:latestMigration}),e=>e.code==='MIGRATION_COLUMNS_MISMATCH');
});
