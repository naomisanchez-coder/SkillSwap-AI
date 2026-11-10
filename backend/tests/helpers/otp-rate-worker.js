// Explicit child-process integration worker. No credentials or HMACs in stdout.
import {createDatabase} from '../../src/config/db.js';
import {createEmailRateRepository} from '../../src/modules/auth/email-rate.repository.js';
let database;
try {
  if(process.env.DATABASE_TEST_DB!=='skillswap_ai_test_auth'||process.env.DATABASE_TEST_USER!=='skillswap_test_app'||!process.env.DATABASE_TEST_PASSWORD)throw Error();
  let data='';for await(const chunk of process.stdin){data+=chunk;if(data.length>1024)throw Error();}
  const input=JSON.parse(data);if(!/^[0-9a-f]{64}$/.test(input.id))throw Error();
  database=createDatabase({host:'127.0.0.1',port:3306,database:process.env.DATABASE_TEST_DB,user:process.env.DATABASE_TEST_USER,password:process.env.DATABASE_TEST_PASSWORD});
  const [[identity]]=await database.execute('SELECT CURRENT_USER() AS account');if(identity.account!=='skillswap_test_app@127.0.0.1')throw Error();
  const result=await createEmailRateRepository(database).take(Buffer.from(input.id,'hex'));
  console.log(JSON.stringify(result));
}catch{console.error('Isolated admission worker failed; no private values exposed');process.exitCode=1;}
finally{if(database)await database.close();}
