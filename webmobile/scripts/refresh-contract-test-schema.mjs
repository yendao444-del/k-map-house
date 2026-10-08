import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { root } from './private-config.mjs'
import { contractTestConfig,testManagement } from './contract-test-config.mjs'
const env=await contractTestConfig(),schema=env.CONTRACT_DB_SCHEMA
if(schema!=='ankhang_contract_test') throw new Error('Wrong test schema')
const sql=(await readFile(path.join(root,'cloud/contract-confirmation-schema.sql'),'utf8')).replaceAll('public.',`${schema}.`).replaceAll('search_path=public',`search_path=${schema}`)
await testManagement(env,'/database/query',{query:sql})
const history=(await readFile(path.join(root,'../supabase/migrations/20261007180000_contract_confirmation_history.sql'),'utf8')).replaceAll('public.',`${schema}.`).replaceAll('search_path=public',`search_path=${schema}`)
await testManagement(env,'/database/query',{query:history})
console.log('Current contract schema applied to isolated TEST project only.')

const lifecycle=(await readFile(path.join(root,'../supabase/migrations/20261007190000_contract_revisions_and_cancellation.sql'),'utf8')).replaceAll('public.',`${schema}.`).replaceAll('search_path=public',`search_path=${schema}`)
await testManagement(env,'/database/query',{query:lifecycle})

const policy=(await readFile(path.join(root,'../supabase/migrations/20261007200000_contract_cancellation_policy.sql'),'utf8')).replaceAll('public.',`${schema}.`).replaceAll('search_path=public',`search_path=${schema}`)
await testManagement(env,'/database/query',{query:policy})

const testReset=(await readFile(path.join(root,'../supabase/migrations/20261008210000_contract_test_cancellation.sql'),'utf8')).replaceAll('public.',`${schema}.`).replaceAll('search_path=public',`search_path=${schema}`)
await testManagement(env,'/database/query',{query:testReset})

const emailSeparation=(await readFile(path.join(root,'../supabase/migrations/20261008220000_tenant_system_email_separation.sql'),'utf8')).replaceAll('public.',`${schema}.`).replaceAll('search_path=public',`search_path=${schema}`)
await testManagement(env,'/database/query',{query:emailSeparation})

for (const file of ['20261008223000_contract_account_visibility.sql', '20261008224000_contract_wrong_email_cancellation.sql', '20261008233000_tenant_auth_provisioning.sql']) {
 const rules=(await readFile(path.join(root,'../supabase/migrations',file),'utf8')).replaceAll('public.',`${schema}.`).replaceAll('search_path=public',`search_path=${schema}`)
 await testManagement(env,'/database/query',{query:rules})
}
