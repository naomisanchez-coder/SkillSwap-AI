import test from 'node:test';
import assert from 'node:assert/strict';
import { readMigration, readMigrations, latestMigration, checkMigrationPrivileges,
  parseMigrationArguments } from '../database/migrate.js';

test('003 is additive, pseudonymous, fixed-window and independently checksummed',async()=>{
  assert.equal(latestMigration,'003_login_rate_limits');
  const migrations=await readMigrations(latestMigration);assert.deepEqual(migrations.map(item=>item.version),
    ['001_auth_foundation','002_otp_delivery_safety','003_login_rate_limits']);
  assert.equal(migrations[0].checksum,'a544084c180a8c8ce701bd506bc98819d4e433b61460b1b20b7dbe4f0e1061c8');
  assert.equal(migrations[1].checksum,'bd3cdf30528264baad434993caf1c0334a64bb6ca4d71bcc6518cc3b7d974c8e');
  const migration=await readMigration(latestMigration);assert.equal(migration.checksum,'46866a4e7d745276542b1276445b40bc5424ae9667716f864d562d05693eebc2');assert.equal(migration.statements.length,4);
  const create=migration.statements[2];assert.match(create,/^CREATE TABLE login_rate_limits/);
  assert.match(create,/PRIMARY KEY \(scope, identifier_hmac\)/);assert.match(create,/KEY ix_login_rate_expiry \(expires_at\)/);
  assert.match(create,/scope IN \('EMAIL', 'IP'\)/);assert.match(create,/OCTET_LENGTH\(identifier_hmac\) = 32/);
  assert.match(create,/attempts BETWEEN 0 AND 20/);assert.match(create,/INTERVAL 15 MINUTE/);
  assert.doesNotMatch(create,/^\s+(email|ip)\s+(?:VAR)?CHAR/gmi);
  assert.ok(!migration.statements.some(statement=>/^(DROP|ALTER|DELETE|UPDATE|TRUNCATE)\b/.test(statement)));
});

test('migration CLI selects 001, 002 or 003 explicitly and rejects missing versions',()=>{
  assert.deepEqual(parseMigrationArguments([]),{apply:false,through:'001_auth_foundation'});
  assert.deepEqual(parseMigrationArguments(['--check','--through=002_otp_delivery_safety']),
    {apply:false,through:'002_otp_delivery_safety'});
  assert.deepEqual(parseMigrationArguments(['--apply','--through=003_login_rate_limits']),
    {apply:true,through:'003_login_rate_limits'});
  for(const args of [['--through=003_login_rate_limits'],['--check','--through=004_missing'],['--force'],
    ['--apply','--through=003_login_rate_limits','extra']])assert.throws(()=>parseMigrationArguments(args),
    error=>error.code==='MIGRATION_ARGUMENT_INVALID');
});

test('003 minimum grants need CREATE/SELECT/INSERT but no ALTER or REFERENCES for an already-upgraded schema',()=>{
  const base={grant:'GRANT SELECT, INSERT, CREATE ON `skillswap\\_ai\\_test\\_auth`.* TO `isolated_migrator`@`127.0.0.1`'};
  checkMigrationPrivileges([base], 'skillswap_ai_test_auth', 0, {requireReferences:false});
  assert.throws(()=>checkMigrationPrivileges([{grant:'GRANT SELECT, INSERT ON `skillswap\\_ai\\_test\\_auth`.* TO `isolated_migrator`@`127.0.0.1`'}],
    'skillswap_ai_test_auth',0,{requireReferences:false}),error=>error.code==='MIGRATION_PRIVILEGES_MISSING');
  const alter={grant:'GRANT ALTER ON `skillswap_ai_test_auth`.`email_verifications` TO `isolated_migrator`@`127.0.0.1`'};
  assert.throws(()=>checkMigrationPrivileges([base,alter],'skillswap_ai_test_auth',0,{requireReferences:false}),
    error=>error.code==='MIGRATION_EXCESS_PRIVILEGES_REJECTED');
});
