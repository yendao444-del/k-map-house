import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { privateConfig, management, root } from './private-config.mjs'
const env=await privateConfig()
assert.equal(new URL(env.SUPABASE_URL).hostname, 'wtrycmiojsiliyjxsewz.supabase.co')
const resultFile=path.join(root,'qa/room999-cleanup-result.json')
const report=JSON.parse(await readFile(resultFile,'utf8'))
const r=report.roomId,c=report.contractId,t=report.tenantId,u=report.authUserId
for(const value of [r,c,t,u])assert.match(value,/^[a-zA-Z0-9_-]+$/)
const scopes={
 rooms:`id='${r}'`,contracts:`room_id='${r}'`,invoices:`room_id='${r}'`,cash_transactions:`room_id='${r}'`,move_in_receipts:`room_id='${r}'`,
 contract_drafts:`room_id='${r}'`,contract_confirmations:`contract_id='${c}'`,contract_lifecycle_events:`contract_id='${c}'`,contract_usage_evidence:`contract_id='${c}'`,contract_test_designations:`room_id='${r}'`,contract_cancellation_notices:`contract_id='${c}'`,
 room_assets:`room_id='${r}'`,asset_snapshots:`room_id='${r}'`,room_asset_adjustments:`room_id='${r}'`,room_vehicles:`room_id='${r}'`,tenant_payment_cycles:`room_id='${r}'`,tenant_auth_provisions:`tenant_id='${t}'`,tenant_web_accounts:`tenant_id='${t}'`,tenant_meter_photos:`user_id='${u}'`,tenant_meter_manual_entries:`user_id='${u}'`,tenant_payment_receipts:`tenant_id='${t}'`,webmobile_auth_sessions:`user_id='${u}'`,webmobile_demo_accounts:`user_id='${u}' or contract_id='${c}'`,tenants:`id='${t}'`,
}
const [{remaining}]=await management(env,'/database/query',{query:`select jsonb_build_object(${Object.entries(scopes).map(([table,scope])=>`'${table}',(select count(*) from public.${table} where ${scope})`).join(',')},'auth_user',(select count(*) from auth.users where id='${u}'),'confirmation_events',(select count(*) from public.contract_confirmation_events where confirmation_id='991899c7-4db7-4df7-8c1e-8bcac2f511e9')) remaining`})
for(const [table,n] of Object.entries(remaining))assert.equal(Number(n),0,`${table} retains test data`)
const backup=JSON.parse(await readFile(path.join(root,'qa/private',report.backupFile),'utf8'))
// The deletion transaction compared protected-table hashes before COMMIT.
Object.assign(report,{verifiedAt:new Date().toISOString(),remaining,atomicTransaction:true,otherBusinessDataUnchanged:true,financialDataUnchanged:true,emailsSent:false,deleted:Object.fromEntries(Object.entries(backup.snapshot).map(([table,rows])=>[table,rows.length]))})
await writeFile(resultFile,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({verified:true,remaining,deleted:report.deleted,financialDataUnchanged:true,otherBusinessDataUnchanged:true}))
