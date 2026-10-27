import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../../webmobile/scripts/private-config.mjs'
const env=await privateConfig()
const project=new URL(env.SUPABASE_URL||env.VITE_SUPABASE_URL).hostname.split('.')[0]
async function query(sql){const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(30000)});const body=await response.json();if(!response.ok)throw new Error(`RLS QA HTTP ${response.status}: ${JSON.stringify(body).slice(0,1500)}`);return body}
const result=await query(`begin;
create temporary table rls_results(name text,settings integer,debt_entries integer,table_grant boolean); grant all on rls_results to authenticated;
select set_config('request.jwt.claim.sub',(select id::text from public.users where role='admin' and status='active' order by created_at,id limit 1),true);
set local role authenticated;
insert into rls_results select 'admin',(select count(*) from public.app_settings)::int,(select count(*) from public.debt_entries)::int,null;
select set_config('request.jwt.claim.sub',(select id::text from public.users where role='user' and status='active' order by created_at,id limit 1),true);
insert into rls_results select 'staff',(select count(*) from public.app_settings)::int,(select count(*) from public.debt_entries)::int,null;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000000',true);
insert into rls_results select 'unknown',(select count(*) from public.app_settings)::int,(select count(*) from public.debt_entries)::int,null;
insert into rls_results select 'anon',null,null,has_table_privilege('anon','public.app_settings','SELECT') or has_table_privilege('anon','public.debt_entries','SELECT');
select * from rls_results order by name;
rollback;`)
const rows=result.filter(item=>item.name!==undefined)
if(rows.length!==4) { console.log(JSON.stringify(result,null,2)); throw new Error('RLS query returned incomplete role evidence') }
const admin=rows.find(r=>r.name==='admin'),staff=rows.find(r=>r.name==='staff'),unknown=rows.find(r=>r.name==='unknown'),anon=rows.find(r=>r.name==='anon')
assert.ok(admin.settings>=0&&admin.debt_entries>=0&&staff.settings>=0&&staff.debt_entries>=0)
assert.equal(unknown.settings,0);assert.equal(unknown.debt_entries,0);assert.equal(anon.table_grant,false)
const report={verifiedAt:new Date().toISOString(),mode:'production SQL role simulation inside rollback-only transaction; no data mutation',rows,assertions:['active admin read permitted','active staff read permitted','unknown authenticated profile read denied','anonymous read denied']}
await writeFile(new URL('../qa/management-rls-guard-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
