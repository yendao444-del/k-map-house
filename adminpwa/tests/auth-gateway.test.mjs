import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { onRequest } from '../functions/api/management-auth.js'
const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../backend/functions/admin-pwa-auth/handler.ts',import.meta.url))], bundle:true,write:false,platform:'node',format:'esm' })
const { createManagementAuthHandler } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const config={supabaseUrl:'https://example.supabase.co',anonKey:'anon',serviceKey:'private',gatewaySecret:'server-only-gateway-secret-123456789'}
const id='12345678-1234-1234-1234-123456789abc'
const accessToken='fixture.'+Buffer.from(JSON.stringify({sub:id,session_id:'87654321-1234-1234-1234-123456789abc',aal:'aal1',aud:'authenticated'})).toString('base64url')+'.signature'
const ip='a'.repeat(64)
const json=(data,status=200)=>Response.json(data,{status})
const request=(payload,headers={})=>new Request('https://example.supabase.co/functions/v1/admin-pwa-auth',{method:'POST',headers:{Authorization:`Bearer ${config.gatewaySecret}`,'x-management-ip':ip,'Content-Type':'application/json',...headers},body:typeof payload==='string'?payload:JSON.stringify(payload)})
const input={action:'login',login:'staff',password:'correct-password'}
function harness({exists=true,passwordOk=true,role='user',status='active',rate=true,rateStatus=200}={}) {
 const calls=[]
 const handler=createManagementAuthHandler(config,async (url,init)=>{
  calls.push({url,init})
  if(url.endsWith('admin_pwa_auth_rate'))return json(rate,rateStatus)
  if(url.endsWith('resolve_login_email'))return json(exists?'private-staff@example.com':null)
  if(url.includes('grant_type=password'))return json(passwordOk&&exists?{user:{id},access_token:accessToken,refresh_token:'refresh-secret'}:{error:'bad-password'},passwordOk&&exists?200:400)
  if(url.endsWith('security_service'))return json({ok:true,state:'optional'})
  if(url.includes('/rest/v1/users?'))return json([{id,role,status}])
  if(url.includes('/auth/v1/logout'))return new Response(null,{status:204})
  if(url.includes('/auth/v1/recover'))return json({})
  throw new Error('Unexpected URL '+url)
 })
 return {handler,calls}
}
test('direct public Edge calls and forged gateway fail before any backend lookup',async()=>{
 for(const headers of [{Authorization:'Bearer anon'},{Authorization:'Bearer fake-gateway'}, {'x-management-ip':'spoofed'}]){
  const {handler,calls}=harness();assert.equal((await handler(request(input,headers))).status,403);assert.equal(calls.length,0)
 }
})
test('rate gate fails closed and never resolves email or checks passwords on denial',async()=>{
 for(const options of [{rate:false,expected:429},{rateStatus:503,expected:503}]){const {handler,calls}=harness(options);assert.equal((await handler(request(input))).status,options.expected);assert.equal(calls.length,1)}
})
test('wrong password and missing username return identical errors without email or tokens',async()=>{
 const a=harness({passwordOk:false}), b=harness({exists:false})
 const ra=await a.handler(request(input)),rb=await b.handler(request(input))
 assert.equal(ra.status,401);assert.equal(rb.status,401);assert.deepEqual(await ra.json(),await rb.json())
})
test('existing active admin/staff retain login and only receive session tokens',async()=>{
 for(const role of ['admin','user']){const {handler,calls}=harness({role});const response=await handler(request(input));assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,session:{access_token:accessToken,refresh_token:'refresh-secret'}});const rateBody=JSON.parse(calls[0].init.body);assert.equal(rateBody.p_ip,ip);assert.match(rateBody.p_login,/^[a-f0-9]{64}$/);assert.notEqual(rateBody.p_login,'staff');assert.ok(calls.some(c=>c.init.body&&JSON.parse(c.init.body).p_action==='register'))}
})
test('inactive and tenant profiles cannot receive tokens; rejected sessions are logged out',async()=>{
 for(const options of [{status:'inactive'},{role:'tenant'}]){const {handler,calls}=harness(options);assert.equal((await handler(request(input))).status,401);assert.ok(calls.some(call=>call.url.includes('/auth/v1/logout')))}
})
test('bounded input rejects arbitrary actions, redirect injection, malformed and oversized bodies',async()=>{
 for(const [payload,status] of [[null,400],[[],400],[{...input,redirectTo:'https://attacker.invalid'},400],['not-json',400],['a'.repeat(4097),413]]){const {handler,calls}=harness();assert.equal((await handler(request(payload))).status,status);assert.equal(calls.length,0)}
})
test('recovery returns a generic result and uses a fixed trusted callback',async()=>{
 const {handler,calls}=harness();const response=await handler(request({action:'recover',login:'unknown@example.com'}));assert.equal(response.status,202);assert.deepEqual(await response.json(),{ok:true});assert.ok(calls.some(c=>c.url.includes(encodeURIComponent('https://app.phongtroankhang.com/?password-recovery=1'))));assert.ok(!calls.some(c=>c.url.includes('resolve_login_email')))
})
test('Pages gateway derives hash from Cloudflare IP, ignores caller forwarded IP and never leaks secret',async()=>{
 const original=globalThis.fetch;let forwarded
 globalThis.fetch=async (url,init)=>{forwarded={url,init};return json({ok:false},401)}
 try {
  const env={ADMIN_PWA_AUTH_GATEWAY_SECRET:config.gatewaySecret,ADMIN_PWA_AUTH_EDGE_URL:'https://wtrycmiojsiliyjxsewz.supabase.co/functions/v1/admin-pwa-auth'}
  const run=forwardedIp=>onRequest({env,request:new Request('https://app.phongtroankhang.com/api/management-auth',{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':'203.0.113.1','x-forwarded-for':forwardedIp,'x-management-ip':'fake'},body:JSON.stringify(input)})})
  const response=await run('1.1.1.1');assert.equal(response.status,401);const first=forwarded.init.headers['x-management-ip'];assert.match(first,/^[a-f0-9]{64}$/);assert.ok(!(await response.text()).includes(config.gatewaySecret));await run('2.2.2.2');assert.equal(forwarded.init.headers['x-management-ip'],first)
  assert.equal((await onRequest({env,request:new Request('https://app.phongtroankhang.com/api/management-auth',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://attacker.invalid'},body:'{}'})})).status,403)
 } finally {globalThis.fetch=original}
})
test('legacy finance cleanup removes private history without touching Auth or other preferences',async()=>{
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/renderer/src/lib/private-finance-cache.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm'})
 const {clearLegacyFinanceCache}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
 const stores=Array.from({length:2},()=>new Map([['an-khang-debt-entries','private'],['an-khang-debt-summary','private'],['ankhang-management-auth','auth'],['weather','preference']]))
 const original=globalThis.window
 globalThis.window={localStorage:{removeItem:k=>stores[0].delete(k)},sessionStorage:{removeItem:k=>stores[1].delete(k)}}
 try {clearLegacyFinanceCache();for(const store of stores){assert.equal(store.size,2);assert.equal(store.get('ankhang-management-auth'),'auth')}}finally{globalThis.window=original}
 const debt=await readFile(new URL('../src/renderer/src/components/DebtReport.tsx',import.meta.url),'utf8')
 assert.doesNotMatch(debt,/localStorage|sessionStorage|storedEntries/)
})
