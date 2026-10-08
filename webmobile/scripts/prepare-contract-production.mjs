import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { root, privateConfig, management } from './private-config.mjs'
import { contractTestConfig } from './contract-test-config.mjs'
const env = await privateConfig(), test = await contractTestConfig()
env.SUPABASE_ACCESS_TOKEN = test.SUPABASE_ACCESS_TOKEN
if (new URL(env.SUPABASE_URL).hostname !== 'wtrycmiojsiliyjxsewz.supabase.co') throw new Error('Wrong production project')
const query = `select jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_object('name',table_name,'column',column_name,'type',data_type,'nullable',is_nullable,'default',column_default)) from information_schema.columns where table_schema='public' and table_name in ('contracts','rooms','tenants','contract_drafts','asset_snapshots','tenant_web_accounts')),
 'constraints',(select jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid))) from pg_constraint where conrelid in ('public.contracts'::regclass,'public.contract_drafts'::regclass,'public.asset_snapshots'::regclass)),
 'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'contract_%' or p.proname in ('webmobile_enroll_tenant','webmobile_revoke_tenant','webmobile_auth_rate'))),
 'triggers',(select jsonb_agg(pg_get_triggerdef(oid)) from pg_trigger where not tgisinternal and tgrelid='public.contracts'::regclass),
 'counts',jsonb_build_object('contracts',(select count(*) from public.contracts),'drafts',(select count(*) from public.contract_drafts),'rooms',(select count(*) from public.rooms),'tenants',(select count(*) from public.tenants))) as inspection;`
const inspected = (await management(env, '/database/query', { query }))[0].inspection
await mkdir(path.join(root,'qa/private'),{recursive:true})
await writeFile(path.join(root,'qa/private/contract-production-before.json'), JSON.stringify(inspected,null,2)+'\n')
console.log(JSON.stringify({counts:inspected.counts,functions:inspected.functions?.map(x=>x.name),contractColumns:inspected.tables.filter(x=>x.name==='contracts').map(x=>x.column),assetColumns:inspected.tables.filter(x=>x.name==='asset_snapshots'),constraints:inspected.constraints,triggers:inspected.triggers}))
const file = path.join(root,'../.env')
let content = await readFile(file,'utf8')
const updates = { SUPABASE_ACCESS_TOKEN:test.SUPABASE_ACCESS_TOKEN, DEV_GMAIL_CLIENT_ID:test.DEV_GMAIL_CLIENT_ID, DEV_GMAIL_CLIENT_SECRET:test.DEV_GMAIL_CLIENT_SECRET, GMAIL_SENDER_EMAIL:'phongtroankhang.com@gmail.com', VITE_CONTRACT_CONFIRMATION_API_URL:`${env.SUPABASE_URL}/functions/v1/contract-confirmation` }
for (const [key,value] of Object.entries(updates)) {
 if (!value) throw new Error(`Missing ${key}`)
 const line=`${key}=${value}`
 content = new RegExp(`^${key}=.*$`,'m').test(content) ? content.replace(new RegExp(`^${key}=.*$`,'m'),()=>line) : content.trimEnd()+'\n'+line+'\n'
}
await writeFile(file,content)
console.log('Electron production Gmail and confirmation config prepared; no credentials printed.')
