import { readFile, writeFile } from 'node:fs/promises'
import { privateConfig, management } from './private-config.mjs'
const origin=process.env.WEBMOBILE_VERIFY_ORIGIN||'https://pay.phongtroankhang.com'
const accounts=JSON.parse(await readFile(new URL('../qa/private/demo-login-accounts.json',import.meta.url),'utf8'))
const evidence={origin,checkedAt:new Date().toISOString(),checks:[]}
async function call(path,data,cookie='') {
  const response=await fetch(`${origin}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(25000)})
  return {response,data:await response.json(),cookie:response.headers.getSetCookie().map(item=>item.split(';')[0]).join('; ')}
}
function check(name,pass) {evidence.checks.push({name,pass:!!pass});if(!pass)throw new Error(`Auth check failed: ${name}`)}
check('unauthenticated invoice blocked',(await call('demo-payments',{action:'create',contractId:'demo-current-101'})).response.status===401)
check('wrong password rejected',(await call('auth',{action:'login',email:accounts[0].email,password:'intentionally-wrong-fixture'})).response.status===401)
for(const account of accounts) {
  const login=await call('auth',{action:'login',email:account.email,password:account.password})
  check(`${account.room} authenticated`,login.response.ok&&login.data.profile.room===account.room)
  check(`${account.room} secret tokens absent from JSON`,!login.data.sessionId&&!login.data.access_token&&!login.data.refresh_token)
  check(`${account.room} secure session cookie`,login.response.headers.getSetCookie().some(cookie=>cookie.startsWith('__Host-webmobile-auth=')&&cookie.includes('HttpOnly; Secure; SameSite=Lax')))
  check(`${account.room} session reload`,(await call('auth',{action:'session'},login.cookie)).data.profile?.room===account.room)
  const other=account.room==='101'?'demo-current-102':'demo-current-101'
  check(`${account.room} other contract rejected`,(await call('meter-ocr',{contractId:other,meter:'electric',mode:'check'},login.cookie)).response.status===403)
  check(`${account.room} public simulation disabled`,(await call('demo-payments',{action:'simulate'},login.cookie)).response.status===403)
  if(account.room==='101') {
    const env=await privateConfig()
    const sessionId=login.cookie.match(/__Host-webmobile-auth=([a-f0-9-]{36})/)?.[1]
    if(!sessionId)throw new Error('Missing test session ID')
    await management(env,'/database/query',{query:`update public.webmobile_auth_sessions set token_expires_at=now()-interval '1 minute' where id='${sessionId}'::uuid and user_id='${account.userId}'::uuid`})
    check('session refresh with Supabase', (await call('auth',{action:'session'},login.cookie)).data.profile?.room===account.room)
  }
  check(`${account.room} logout`,(await call('auth',{action:'logout'},login.cookie)).response.ok)
  check(`${account.room} old cookie revoked`,(await call('auth',{action:'session'},login.cookie)).response.status===401)
}
const old=await fetch('https://phongtroankhang.com/?tenant=new',{redirect:'manual'})
check('old domain redirects preserving path/query',old.status===302&&old.headers.get('location')==='https://pay.phongtroankhang.com/?tenant=new')
await writeFile(new URL('../qa/public-auth-checks.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n')
console.log(`Verified ${evidence.checks.length} public authentication, session and contract isolation checks. No credentials printed.`)
