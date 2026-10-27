import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../../webmobile/scripts/private-config.mjs'
const env=await privateConfig(), query=sql=>management(env,'/database/query',{query:sql})
const before=await query("select tablename,policyname,permissive,cmd from pg_policies where schemaname='public' and policyname in ('pwa_management_active_guard','pwa_debt_active_guard','pwa_debt_insert_permission_guard','pwa_debt_update_permission_guard','pwa_debt_delete_permission_guard') order by tablename,policyname")
if(before.length) throw new Error('Management RLS guard is already present; refusing to reapply blindly.')
const sql=await readFile(new URL('../backend/migrations/20261008_management_rls_guard.sql',import.meta.url),'utf8')
await query(sql)
const after=await query("select tablename,policyname,permissive,cmd from pg_policies where schemaname='public' and policyname in ('pwa_management_active_guard','pwa_debt_active_guard','pwa_debt_insert_permission_guard','pwa_debt_update_permission_guard','pwa_debt_delete_permission_guard') order by tablename,policyname")
assert.equal(after.length,5)
const report={appliedAt:new Date().toISOString(),mode:'additive restrictive RLS only; no Electron/source/data mutation',before,after,scope:['app_settings','debt_entries'],checks:['inactive/tenant/anonymous excluded by active management profile guard','admin/user active profiles remain eligible','debt inserts constrained by actor/role and permitted types','debt update/delete admin-only']}
await writeFile(new URL('../qa/management-rls-guard.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
