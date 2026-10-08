import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { privateConfig, management, root } from './private-config.mjs'
import { contractTestConfig, testManagement } from './contract-test-config.mjs'
const env = await contractTestConfig()
const schema = 'ankhang_contract_test'
const production = await privateConfig()
production.SUPABASE_ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN
// Read STRUCTURE only. No production data, email, settings values or tokens.
const definitions = await management(production, '/database/query', { query: `select c.relname as name,
  'create table if not exists ${schema}.'||quote_ident(c.relname)||' ('||string_agg(quote_ident(a.attname)||' '||format_type(a.atttypid,a.atttypmod)||
  case when ad.adbin is not null then ' default '||pg_get_expr(ad.adbin,ad.adrelid) else '' end||case when a.attnotnull then ' not null' else '' end,', ' order by a.attnum)||');' as sql
  from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  left join pg_attrdef ad on ad.adrelid=c.oid and ad.adnum=a.attnum where n.nspname='public' and c.relkind='r'
  and c.relname not like 'webmobile_%' and c.relname not in ('tenant_web_accounts','contract_confirmations') group by c.relname order by c.relname;` })
const constraints = await management(production, '/database/query', { query: `select c.relname as name,k.conname,k.contype,
  replace(pg_get_constraintdef(k.oid),'REFERENCES public.','REFERENCES ${schema}.') as definition
  from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relname not like 'webmobile_%' and c.relname not in ('tenant_web_accounts','contract_confirmations') order by case when k.contype='f' then 1 else 0 end,c.relname;` })
const known = new Set(definitions.map(x => x.name))
let sql = `begin; create schema if not exists ${schema}; set local search_path=${schema},public; grant usage on schema ${schema} to anon,authenticated,service_role;\n`
sql += definitions.map(x => x.sql).join('\n')
for (const row of constraints) {
  if (row.contype === 'f' && /REFERENCES public\./.test(row.definition)) continue
  sql += `\ndo $$ begin if not exists(select 1 from pg_constraint where conrelid='${schema}.${row.name}'::regclass and conname='${row.conname}') then alter table ${schema}."${row.name}" add constraint "${row.conname}" ${row.definition}; end if; end $$;`
}
sql += `\ncreate or replace function ${schema}.is_test_admin() returns boolean language sql stable security definer set search_path=${schema},pg_temp as $$ select exists(select 1 from users where id=auth.uid() and role='admin' and status='active'); $$;
  revoke all on function ${schema}.is_test_admin() from public; grant execute on function ${schema}.is_test_admin() to authenticated;
  grant all on all tables in schema ${schema} to service_role;\n`
for (const name of known) {
  sql += `alter table ${schema}."${name}" enable row level security; revoke all on ${schema}."${name}" from public,anon; grant select,insert,update,delete on ${schema}."${name}" to authenticated;
    drop policy if exists contract_test_admin on ${schema}."${name}"; create policy contract_test_admin on ${schema}."${name}" to authenticated using(${schema}.is_test_admin()) with check(${schema}.is_test_admin());\n`
}
sql += `drop policy if exists contract_test_self on ${schema}.users; create policy contract_test_self on ${schema}.users for select to authenticated using(id=auth.uid());
create or replace function ${schema}.resolve_login_email(login_name text) returns text language sql stable security definer set search_path=${schema},pg_temp as $$ select email from users where status='active' and (lower(username)=lower(login_name) or lower(email)=lower(login_name)) limit 1; $$;
revoke all on function ${schema}.resolve_login_email(text) from public; grant execute on function ${schema}.resolve_login_email(text) to anon,authenticated;
commit;`
await testManagement(env, '/database/query', { query: sql })
for (const file of ['../supabase/migrations/20261005210000_contract_drafts.sql','cloud/schema.sql','cloud/auth-schema.sql','cloud/tenant-accounts-schema.sql','cloud/contract-confirmation-schema.sql','../supabase/migrations/20261007180000_contract_confirmation_history.sql','../supabase/migrations/20261007190000_contract_revisions_and_cancellation.sql','../supabase/migrations/20261007200000_contract_cancellation_policy.sql','../supabase/migrations/20261008210000_contract_test_cancellation.sql','../supabase/migrations/20261008220000_tenant_system_email_separation.sql','../supabase/migrations/20261008223000_contract_account_visibility.sql','../supabase/migrations/20261008224000_contract_wrong_email_cancellation.sql','../supabase/migrations/20261008233000_tenant_auth_provisioning.sql']) {
  const source = (await readFile(path.join(root, file), 'utf8')).replaceAll('public.',`${schema}.`).replaceAll('search_path = public',`search_path = ${schema}`).replaceAll('search_path=public',`search_path=${schema}`)
  await testManagement(env, '/database/query', { query: source })
}
const config = await testManagement(env, '/postgrest')
const schemas = [...new Set(config.db_schema.split(',').map(x => x.trim()).concat(schema))].join(',')
if (schemas !== config.db_schema) await testManagement(env, '/postgrest', { db_schema: schemas }, 'PATCH')
await testManagement(env, '/database/query', { query: `alter role authenticator set pgrst.db_schemas='${schemas.replaceAll("'","''")}'; notify pgrst,'reload config'; notify pgrst,'reload schema';` })
// Synthetic room only. The email is the owner's allowlisted test address.
await testManagement(env, '/database/query', { query: `insert into ${schema}.service_zones(id,name,electric_price,water_price,internet_price,cleaning_price) values('zone-contract-test','Khu test',3500,18000,100000,30000) on conflict do nothing;
insert into ${schema}.rooms(id,name,base_rent,status,service_zone_id,area,electric_old,electric_new,water_old,water_new) values('room-contract-test-999','999',2500000,'vacant','zone-contract-test',25,1200,1200,80,80) on conflict do nothing;
insert into ${schema}.tenants(id,full_name,email,phone,is_active) values('tenant-contract-test','Khách thuê thử nghiệm','zicky.iluv@gmail.com','0900000000',true) on conflict do nothing;
insert into ${schema}.app_settings(id,property_name,property_address,property_owner_name,property_owner_phone) values(1,'AN KHANG HOME · TEST','Địa chỉ thử nghiệm','Chủ nhà thử nghiệm','0900000000') on conflict do nothing;` })
const password = env.CONTRACT_TEST_ADMIN_PASSWORD || `Ak!${randomBytes(18).toString('base64url')}`
const adminEmail = env.CONTRACT_TEST_ADMIN_EMAIL || 'admin-contract-test@ankhanghome.example'
if (!env.CONTRACT_TEST_ADMIN_ID) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type':'application/json' }, body: JSON.stringify({ email: adminEmail, password, email_confirm: true, user_metadata: { full_name: 'Admin TEST', username: 'admin-contract-test' } }) })
  const data = await response.json(); if (!response.ok) throw new Error(`TEST admin creation ${response.status}`)
  env.CONTRACT_TEST_ADMIN_ID = data.id
}
await testManagement(env, '/database/query', { query: `insert into ${schema}.users(id,email,username,full_name,role,status) values('${env.CONTRACT_TEST_ADMIN_ID}','${adminEmail}','admin-contract-test','Admin TEST','admin','active') on conflict(id) do nothing;` })
Object.assign(env, { CONTRACT_DB_SCHEMA: schema, VITE_CONTRACT_DB_SCHEMA: schema, VITE_CONTRACT_TEST: '1', CONTRACT_TEST_ADMIN_EMAIL: adminEmail, CONTRACT_TEST_ADMIN_PASSWORD: password })
await writeFile(path.join(root,'.env.contract-test.local'), Object.entries(env).map(([k,v]) => `${k}=${v}`).join('\n')+'\n')
console.log('TEST schema, synthetic room 999 and separate admin prepared. Existing public tables and production data untouched.')
