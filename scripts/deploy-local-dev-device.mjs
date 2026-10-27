import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes, createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { build } from '../adminpwa/node_modules/esbuild/lib/main.js'
import { fileURLToPath } from 'node:url'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'

const env=await privateConfig()
assert.equal(new URL(env.SUPABASE_URL).hostname,'wtrycmiojsiliyjxsewz.supabase.co')
const migration=await readFile(new URL('../supabase/migrations/20261020090000_security_local_dev_device.sql',import.meta.url),'utf8')
const fixture=await readFile(new URL('../adminpwa/backend/tests/dev-device-rollback.sql',import.meta.url),'utf8')
const regressions=await Promise.all(['email-login-rollback.sql','password-confirmation-rollback.sql','remember-device-rollback.sql','totp-replacement-rollback.sql'].map(n=>readFile(new URL('../adminpwa/backend/tests/'+n,import.meta.url),'utf8')))
const safety=`select (select row_to_json(s) from management_security.settings s where singleton) settings,
  (select md5(string_agg(id::text||role||status,',' order by id)) from public.users) roles,
  (select count(*) from auth.users) auth_users;`
const before=await management(env,'/database/query',{query:safety})
const tests=fixture+'\n'+regressions.map(s=>s.replace(/^begin;/i,'').replace(/rollback;\s*$/i,'')).join('\n')
const checks=await management(env,'/database/query',{query:migration.replace(/commit;\s*$/i,'')+'\n'+tests+"\nselect 'passed' dev_device_invariants, 'passed' email_password_remember_rotation_regressions;\nrollback;"})
assert.ok(checks.some(r=>r.dev_device_invariants==='passed'))
assert.deepEqual(await management(env,'/database/query',{query:safety}),before)
const report={at:new Date().toISOString(),fixturesRolledBack:true,rolesAndSettingsUnchanged:true,tests:checks,productionApplied:false}
if(process.argv.includes('--production')) {
  await management(env,'/database/query',{query:migration})
  const functions=await management(env,'/functions'),prior=functions.find(f=>f.slug==='admin-pwa-auth'||f.name==='admin-pwa-auth')
  assert.ok(prior)
  const bundle=await build({entryPoints:[fileURLToPath(new URL('../adminpwa/backend/functions/admin-pwa-auth/index.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022'})
  const form=new FormData();form.set('metadata',JSON.stringify({name:'admin-pwa-auth',entrypoint_path:'index.js',verify_jwt:prior.verify_jwt}));form.set('file',new Blob([bundle.outputFiles[0].text],{type:'application/javascript'}),'index.js')
  const response=await fetch('https://api.supabase.com/v1/projects/wtrycmiojsiliyjxsewz/functions/deploy?slug=admin-pwa-auth',{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},body:form,signal:AbortSignal.timeout(60000)})
  assert.ok(response.ok,'Function deployment HTTP '+response.status)
  report.functionVersion=(await response.json()).version
  report.productionApplied=true
  if(process.argv.includes('--provision-admin')) {
    assert.equal(process.platform,'win32')
    const rows=await management(env,'/database/query',{query:"select u.id from public.users u join management_security.accounts a on a.user_id=u.id where lower(u.username)='admin' and u.role='admin' and u.status='active' and a.recovery_ack_at is not null and a.recovery_session_id is null;"})
    assert.equal(rows.length,1,'Exactly one active, fully enrolled admin is required')
    const uid=rows[0].id;assert.match(uid,/^[a-f0-9-]{36}$/)
    const token=randomBytes(32).toString('hex')+'.'+randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex')
    const encrypted=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Add-Type -AssemblyName System.Security; $plain=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd().Trim()); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))'],{input:token,encoding:'utf8',windowsHide:true,timeout:10000}).trim()
    assert.match(encrypted,/^[A-Za-z0-9+/=]+$/)
    const directory=new URL('../.dev-auth/',import.meta.url);await mkdir(directory,{recursive:true})
    // Save only DPAPI ciphertext; never persist the plaintext credential.
    await writeFile(new URL('device.dpapi',directory),encrypted+'\n')
    const provisioned=await management(env,'/database/query',{query:`begin;
      update management_security.devices set revoked_at=coalesce(revoked_at,clock_timestamp()) where user_id='${uid}' and local_dev and label='Local Windows development workstation';
      insert into management_security.devices(user_id,token_hash,ip_hash,agent_hash,label,expires_at,local_dev)
        values('${uid}','${hash}',repeat('0',64),repeat('0',64),'Local Windows development workstation',clock_timestamp()+interval '30 days',true)
        returning id,expires_at;
      commit;`})
    assert.ok(provisioned[0]?.id)
    report.device={id:provisioned[0].id,expiresAt:provisioned[0].expires_at,encryptedWith:'Windows DPAPI CurrentUser',firstLoginBindsIpAndAgent:true}
  }
  assert.deepEqual(await management(env,'/database/query',{query:safety}),before)
}
await mkdir(new URL('../docs/security/qa/',import.meta.url),{recursive:true})
await writeFile(new URL('../docs/security/qa/local-dev-device.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
