import test from 'node:test'
import assert from 'node:assert/strict'
import { cloudHandler } from '../cloud/handler.mjs'
import { authService } from '../cloud/auth.mjs'
import { onRequest } from '../functions/api/[[path]].js'

const secret='fixture-gateway'
const id='f629fada-9445-4b51-9e91-11dc961d2f48'
const profile={userId:id,contractId:'demo-current-101',kind:'existing',room:'101'}
const environment={WEBMOBILE_GATEWAY_SECRET:secret,WEBMOBILE_AUTH_REQUIRED:'true',METER_CLOUD_API_KEY:'fixture'}
function request(endpoint,data,session=id) {
  return new Request('https://edge.invalid/',{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json','x-webmobile-endpoint':endpoint,'x-webmobile-auth-session':session,'x-webmobile-session':id,'x-webmobile-ip':'a'.repeat(64)},body:JSON.stringify(data)})
}
const shouldNotRun=()=>{throw new Error('Forbidden request reached storage/provider')}
test('unauthenticated OCR and invoice requests fail before database and provider access',async()=>{
  const auth={session:async()=>{throw Object.assign(new Error('Login required'),{status:401})}}
  const handler=cloudHandler(environment,shouldNotRun,shouldNotRun,auth)
  for(const endpoint of ['meter-ocr','demo-payments']) assert.equal((await handler(request(endpoint,{contractId:'demo-current-101'}))).status,401)
})
test('contract spoofing and demo simulation fail before any writes',async()=>{
  const handler=cloudHandler(environment,shouldNotRun,shouldNotRun,{session:async()=>profile})
  assert.equal((await handler(request('meter-ocr',{contractId:'demo-current-102',meter:'electric'}))).status,403)
  assert.equal((await handler(request('demo-payments',{action:'create',contractId:'demo-current-102'}))).status,403)
  assert.equal((await handler(request('demo-payments',{action:'simulate'}))).status,403)
})
test('old demo session cannot be taken over by another account',async()=>{
  let releases=0
  const rpc=async(name)=>{if(name==='webmobile_demo_claim')return{state:{userId:'other-user'},busy:false};releases++;return true}
  const handler=cloudHandler(environment,rpc,shouldNotRun,{session:async()=>profile})
  assert.equal((await handler(request('demo-payments',{action:'status',id:'old-invoice'}))).status,403)
  assert.equal(releases,1)
})
test('Supabase staff and mutable user metadata never grant portal access',async()=>{
  for(const user of [{id,role:'authenticated',app_metadata:{portal_role:'webmobile_demo_tenant'}},{id,role:'anon',user_metadata:{portal_role:'webmobile_demo_tenant'}}]) {
    const auth=authService({SUPABASE_URL:'https://auth.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'},async()=>true,async()=>Response.json({access_token:'test',user}))
    await assert.rejects(auth.login({email:'fixture@example.invalid',password:'fixture'},'a'.repeat(64)),cause=>cause.status===403)
  }
})
test('login is rate limited before contacting Supabase',async()=>{
  const auth=authService({},async()=>false,shouldNotRun)
  await assert.rejects(auth.login({email:'fixture@example.invalid',password:'fixture'},'a'.repeat(64)),cause=>cause.status===429)
})
test('gateway strips session IDs from JSON, sets secure host-only cookies, rejects CSRF',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({ok:true,sessionId:id,profile}))
  const context={env:{WEBMOBILE_EDGE_URL:'https://edge.invalid',WEBMOBILE_GATEWAY_SECRET:secret},params:{path:['auth']},request:new Request('https://pay.phongtroankhang.com/api/auth',{method:'POST',headers:{Origin:'https://pay.phongtroankhang.com','Content-Type':'application/json'},body:JSON.stringify({action:'login',email:'fixture@example.invalid',password:'fixture'})})}
  const result=await onRequest(context)
  assert.equal(result.status,200);assert.equal((await result.json()).sessionId,undefined)
  const cookies=result.headers.getSetCookie()
  assert.equal(cookies.length,2)
  assert.ok(cookies.some(cookie=>cookie.startsWith(`__Host-webmobile-auth=${id};`)&&cookie.includes('HttpOnly; Secure; SameSite=Lax')))
  context.request=new Request('https://pay.phongtroankhang.com/api/auth',{method:'POST',headers:{Origin:'https://other.invalid','Content-Type':'application/json'},body:'{}'})
  assert.equal((await onRequest(context)).status,403)
})
