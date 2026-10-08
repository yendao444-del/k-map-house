// Read-only audit. Output aggregates and deployment metadata, never credentials or tenant records.
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+\s*=/.test(line)).map(line => { const i = line.indexOf('='); return [line.slice(0,i).trim(),line.slice(i+1).trim().replace(/^['"]|['"]$/g,'')] }))
const ref = new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL).hostname.split('.')[0]
async function management(path, body) {
  const res = await fetch(`https://api.supabase.com/v1${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, ...(body ? {body:JSON.stringify(body)} : {}), signal: AbortSignal.timeout(25000) })
  if (!res.ok) return {httpStatus:res.status}
  return res.json()
}
const results = await Promise.allSettled([
  management(`/projects/${ref}`),
  management(`/projects/${ref}/functions`),
  management(`/projects/${ref}/database/query`, {read_only:true,query:`select pg_size_pretty(pg_database_size(current_database())) as database_total,
    (select pg_size_pretty(coalesce(sum(pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(tablename))),0)::bigint) from pg_tables where schemaname='public') as public_tables,
    (select count(*) from public.rooms) as rooms,
    (select count(*) from public.tenants) as tenants,
    (select count(*) from public.contracts) as contracts,
    (select count(*) from public.invoices) as invoices,
    (select count(*) from public.contract_drafts) as contract_drafts,
    (select count(*) from storage.buckets) as storage_buckets,
    (select count(*) from storage.objects) as storage_objects,
    (select coalesce(sum((metadata->>'size')::bigint),0) from storage.objects) as storage_bytes,
    (select count(*) from public.tenants where identity_image_url like 'data:%') as identity_images_in_database,
    (select coalesce(sum(octet_length(identity_image_url)),0) from public.tenants where identity_image_url like 'data:%') as identity_image_bytes,
    exists(select 1 from pg_extension where extname='pg_cron') as cron_installed,
    exists(select 1 from pg_extension where extname='pg_net') as net_installed;`})
])
for(let i=0;i<results.length;i++) {
  const item=results[i]; const label=['project','deployed_functions','aggregates'][i]
  if(item.status==='rejected'){console.log(JSON.stringify({[label]:{error:'Read-only request failed'}}));continue}
  const value=item.value
  console.log(JSON.stringify({[label]:i===0 && !value.httpStatus ? {status:value.status,region:value.region}: i===1 && Array.isArray(value) ? value.map(fn=>({name:fn.name,status:fn.status,version:fn.version})):value}))
}
