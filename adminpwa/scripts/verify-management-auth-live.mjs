import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes, randomUUID } from 'node:crypto'
import { privateConfig } from '../../webmobile/scripts/private-config.mjs'
const env=await privateConfig()
const production=process.argv.includes('--production')
const deployed=JSON.parse(await readFile(new URL(`../qa/security-pages-${production?'production':'preview'}.json`,import.meta.url),'utf8'))
const url=deployed.url
const backend=env.SUPABASE_URL||env.VITE_SUPABASE_URL
assert.equal(new URL(backend).hostname,'wtrycmiojsiliyjxsewz.supabase.co')
const serviceKey=env.SUPABASE_SERVICE_ROLE_KEY
const anonKey=env.SUPABASE_ANON_KEY||env.VITE_SUPABASE_ANON_KEY
assert.ok(serviceKey&&anonKey)
const fixture=randomUUID().replaceAll('-','')
const username='securityqa_'+fixture
const email=username+'@example.com'
const password='Ak!'+randomBytes(24).toString('base64url')
let userId
const checks=[]
async function api(path,body,key=serviceKey,method=body===undefined?'GET':'POST'){
 const response=await fetch(backend+path,{method,headers:{apikey:key===serviceKey?serviceKey:anonKey,Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)})
 return {response,data:await response.json().catch(()=>null)}
}
async function login(login,password){const response=await fetch(url+'/api/management-auth',{method:'POST',headers:{'Content-Type':'application/json',Origin:new URL(url).origin},body:JSON.stringify({action:'login',login,password}),signal:AbortSignal.timeout(30000)});return {response,data:await response.json().catch(()=>null)}}
try {
 const signup=await api('/auth/v1/signup',{email,password},anonKey)
 if(signup.data?.user?.id)userId=signup.data.user.id
 assert.ok([403,422].includes(signup.response.status))
 assert.equal(signup.data?.error_code||signup.data?.code,'signup_disabled','Public signup was not rejected for the expected reason')
 checks.push({case:'public-signup',status:signup.response.status,rejected:true})
 const created=await api('/auth/v1/admin/users',{email,password,email_confirm:true,user_metadata:{username,full_name:'Security QA temporary account'}})
 assert.ok(created.response.ok&&created.data?.id,`Admin provisioning HTTP ${created.response.status}`)
 userId=created.data.id
 checks.push({case:'admin-provisioning-with-signup-disabled',passed:true})
 for(const mode of production?['username','email']:['username']){
  const signed=await login(mode==='username'?username:email,password)
  assert.equal(signed.response.status,200,`Management ${mode} login HTTP ${signed.response.status}`)
  assert.equal(typeof signed.data?.session?.access_token,'string')
  assert.equal(typeof signed.data?.session?.refresh_token,'string')
  assert.deepEqual(Object.keys(signed.data).sort(),['ok','session'])
  const token=signed.data.session.access_token
  const profile=await api('/auth/v1/user',undefined,token)
  assert.equal(profile.data?.id,userId)
  // api() uses its key as apikey too; use the normal public apikey for logout.
  const logout=await fetch(backend+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:anonKey,Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)})
  assert.ok(logout.ok)
  checks.push({case:`management-${mode}-login`,status:signed.response.status,profileMatches:true,noEmailInResponse:true,sessionRevoked:true})
 }
 const wrong=await login(username,'wrong-password-for-security-qa')
 const absent=await login('__security_absent_'+fixture,'wrong-password-for-security-qa')
 assert.equal(wrong.response.status,401);assert.equal(absent.response.status,401);assert.deepEqual(wrong.data,absent.data)
 checks.push({case:'wrong-password-vs-absent-account',status:401,sameResponse:true})
}finally{
 if(userId){
  const removed=await api('/auth/v1/admin/users/'+userId,undefined,serviceKey,'DELETE')
  assert.ok(removed.response.ok,`Fixture cleanup HTTP ${removed.response.status}`)
  const remaining=await api('/rest/v1/users?id=eq.'+userId+'&select=id')
  if(remaining.data?.length) {const cleaned=await api('/rest/v1/users?id=eq.'+userId,undefined,serviceKey,'DELETE');assert.ok(cleaned.response.ok)}
  checks.push({case:'temporary-account-cleanup',passed:true})
 }
}
const report={verifiedAt:new Date().toISOString(),environment:production?'production':'preview',url,checks,scope:'Temporary QA account only; no customer, payment, invoice, contract or email changes; tokens/password never logged or saved.'}
await writeFile(new URL(`../qa/security-auth-${production?'production':'preview'}-verification.json`,import.meta.url),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
