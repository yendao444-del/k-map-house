import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { build } from '../adminpwa/node_modules/esbuild/lib/main.js'
import { fileURLToPath } from 'node:url'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'

// Default: rollback-only migration + SQL regressions against the real schema.
// --production: apply the tested migration, then deploy only admin-pwa-auth.
// Publish PWA and desktop separately after both backend stages pass.
const env = await privateConfig()
assert.equal(new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL).hostname, 'wtrycmiojsiliyjxsewz.supabase.co')
const migration = await readFile(new URL('../supabase/migrations/20261120100000_security_adaptive_trusted_login.sql', import.meta.url), 'utf8')
const tests = await Promise.all(['adaptive-login-rollback.sql','email-login-rollback.sql'].map(name => readFile(new URL('../adminpwa/backend/tests/' + name, import.meta.url),'utf8')))
const production = process.argv.includes('--production')
const report = { at: new Date().toISOString(), productionRequested: production, databaseApplied: false, edgeDeployed: false, pwaPublished: false, electronPublished: false }
try {
  const config = await management(env, '/config/auth')
  for (const key of ['sessions_timebox','sessions_inactivity_timeout']) {
    assert.ok(!Number(config[key]) || Number(config[key]) >= 30 * 86400, `${key} would terminate trusted sessions before 30 days`)
  }
  const safety = `select (select md5(string_agg(id::text||role||status,',' order by id)) from public.users) roles,
    (select count(*) from auth.users) auth_users,
    (select row_to_json(s) from management_security.settings s where singleton) settings;`
  const before = await management(env,'/database/query',{ query: safety })
  const installed = await management(env,'/database/query',{ query: `select to_regprocedure('public.security_login_attempt(text,text,boolean)') is not null installed;` })
  const trial = installed[0].installed ? 'begin;' : migration.replace(/notify pgrst,'reload schema';\s*commit;\s*$/i, '')
  const dry = await management(env,'/database/query',{ query: trial + '\nsavepoint fixtures;\n' + tests[0] + '\nrollback to fixtures;\n' + tests[1] + '\nrollback;' })
  assert.ok(dry.some(r => r.email_login_invariants === 'passed'))
  assert.deepEqual(await management(env,'/database/query',{ query: safety }),before)
  report.databaseRegression = 'adaptive and email login fixtures passed; rolled back'
  if (production) {
    if (!installed[0].installed) await management(env,'/database/query',{ query: migration })
    report.databaseApplied = true
    await writeFile(new URL('../docs/security/qa/adaptive-login-deployment.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
    const functions = await management(env,'/functions')
    const previous = functions.find(f => f.slug === 'admin-pwa-auth' || f.name === 'admin-pwa-auth')
    assert.ok(previous)
    const bundle = await build({ entryPoints: [fileURLToPath(new URL('../adminpwa/backend/functions/admin-pwa-auth/index.ts',import.meta.url))], bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022' })
    const form = new FormData()
    form.set('metadata',JSON.stringify({ name:'admin-pwa-auth',entrypoint_path:'index.js',verify_jwt:previous.verify_jwt }))
    form.set('file',new Blob([bundle.outputFiles[0].text],{type:'application/javascript'}),'index.js')
    const response = await fetch('https://api.supabase.com/v1/projects/wtrycmiojsiliyjxsewz/functions/deploy?slug=admin-pwa-auth',{
      method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},body:form,signal:AbortSignal.timeout(60000)
    })
    assert.ok(response.ok,'Edge deployment HTTP '+response.status)
    report.edgeVersion = (await response.json()).version
    report.priorEdgeVersion = previous.version
    report.edgeDeployed = true
    assert.deepEqual(await management(env,'/database/query',{ query: safety }),before)
  }
} catch (error) {
  report.error = error.message
  process.exitCode = 1
} finally {
  await writeFile(new URL('../docs/security/qa/adaptive-login-deployment.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report,null,2))
}
