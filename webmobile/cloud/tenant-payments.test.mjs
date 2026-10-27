import test from 'node:test'
import assert from 'node:assert/strict'
import {cloudHandler} from './handler.mjs'
const profile={mode:'tenant',userId:'user-qa',contractId:'contract-qa',room:'999'}
const state={cycle:{id:'cycle-qa',period_start:'2026-10-01',electric_old:100,water_old:10,elapsed_days:30},invoices:[],bank:{name:'BIDV',account:'123456789',owner:'Đỗ Kim Ngân'},notices:[]}
const env={WEBMOBILE_GATEWAY_SECRET:'qa-only',WEBMOBILE_AUTH_REQUIRED:'true',METER_CLOUD_API_KEY:'qa-not-a-key'}
function fixture(p=profile,options={}) {
 const calls=[]
 const rpc=async(name,data)=>{calls.push({name,data});if(options.rpc)return options.rpc(name,data);return name==='tenant_payment_state'?structuredClone(state):name==='webmobile_demo_quota'?true:name==='tenant_payment_write'?{reviewToken:'token-qa',source:'ai-ocr',confirmationToken:'confirm-qa',invoiceId:data.p_action==='create'?'invoice-qa':undefined}:{}}
 const reader=options.reader||(async()=>({ok:true,reading:110,digits:'00110',unit:'kWh',source:'ai-ocr'}))
 const handler=cloudHandler(env,rpc,reader,{session:async()=>p})
 const request=async(endpoint,data,authorized=true)=>handler(new Request('https://qa.invalid/api',{method:'POST',headers:{authorization:authorized?'Bearer qa-only':'bad','content-type':'application/json','x-webmobile-endpoint':endpoint,'x-webmobile-session':'11111111-1111-4111-8111-111111111111','x-webmobile-ip':'a'.repeat(64)},body:JSON.stringify(data)}))
 const multipart=async(endpoint,form,authorized=true)=>handler(new Request('https://qa.invalid/api',{method:'POST',headers:{authorization:authorized?'Bearer qa-only':'bad','x-webmobile-endpoint':endpoint,'x-webmobile-session':'11111111-1111-4111-8111-111111111111','x-webmobile-ip':'a'.repeat(64)},body:form}))
 return {calls,request,multipart}
}
function meterForm(bytes=Uint8Array.from([0xff,0xd8,0xff,0x7e,0xff,0xd9]),type='image/jpeg') {
 const form=new FormData()
 form.set('meter','electric');form.set('contractId',profile.contractId)
 form.set('image',new Blob([bytes],{type}),'meter.jpg')
 return form
}
test('real OCR only creates a pending photo until the tenant verifies the number',async()=>{
 const {request,calls}=fixture();const r=await request('meter-ocr',{contractId:'contract-qa',meter:'electric',image:'qa-photo'})
 assert.equal(r.status,200);const body=await r.json();assert.equal(body.needsConfirmation,true);assert.notEqual(body.autoConfirmed,true);assert.equal(body.reviewToken,'token-qa')
 const writes=calls.filter(c=>c.name==='tenant_payment_write');assert.equal(writes.length,1);assert.equal(writes[0].data.p_action,'photo');assert.equal(writes[0].data.p_user,profile.userId);assert.equal(writes[0].data.p_contract,profile.contractId)
 assert.equal(calls.some(c=>c.name==='webmobile_demo_claim'),false)
 const confirmation=await request('meter-ocr',{mode:'check',meter:'electric',reading:110,reviewToken:body.reviewToken})
 assert.equal((await confirmation.json()).source,'ai-ocr');assert.equal(calls.at(-1).data.p_action,'confirm');assert.equal(calls.at(-1).data.p_data.reviewToken,'token-qa')
})

test('multipart OCR preserves the exact JPEG bytes for both strict Gemini reads',async()=>{
 const bytes=Uint8Array.from([0xff,0xd8,0xff,0x20,0x30,0xff,0xd9]);let received
 const {multipart,calls}=fixture(profile,{reader:async(image)=>{received=image;return {ok:true,reading:110,digits:'00110',unit:'kWh',source:'ai-ocr'}}})
 const response=await multipart('meter-ocr',meterForm(bytes))
 assert.equal(response.status,200);assert.equal((await response.json()).needsConfirmation,true)
 assert.equal(received,`data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`)
 assert.equal(calls.filter(call=>call.name==='tenant_payment_write'&&call.data.p_action==='photo').length,1)
})

test('malformed multipart OCR is rejected before state, provider, or write access',async()=>{
 const cases=[]
 const missing=meterForm();missing.delete('image');cases.push(['missing image',missing,400])
 cases.push(['wrong MIME type',meterForm(Uint8Array.from([0xff,0xd8,0xff,0xd9]),'image/png'),400])
 cases.push(['missing JPEG marker',meterForm(Uint8Array.from([0x00,0xd8,0xff,0xd9])),400])
 const malformedContract=meterForm();malformedContract.set('contractId','contract-qa\nother');cases.push(['invalid contract field',malformedContract,400])
 const duplicate=meterForm();duplicate.append('meter','water');cases.push(['duplicate meter',duplicate,400])
 const extra=meterForm();extra.append('unexpected','value');cases.push(['unexpected field',extra,400])
 const oversized=Uint8Array.from({length:2_962_483},(_,index)=>index===0?0xff:index===1?0xd8:index===2?0xff:1)
 cases.push(['oversized JPEG',meterForm(oversized),413])
 for(const [label,form,status] of cases) {
  let readerCalls=0;const {multipart,calls}=fixture(profile,{reader:async()=>{readerCalls++;throw new Error('Provider must not run')}})
  const response=await multipart('meter-ocr',form)
  assert.equal(response.status,status,label);assert.equal(readerCalls,0,label)
  assert.equal(calls.some(call=>['tenant_payment_state','tenant_payment_write','tenant_payment_fallback','webmobile_demo_quota'].includes(call.name)),false,label)
 }
})

test('tenant session is checked before parsing a multipart upload',async()=>{
 const order=[]
 const handler=cloudHandler(env,()=>{throw new Error('RPC must not run')},()=>{throw new Error('Provider must not run')},{session:async()=>{order.push('session');throw Object.assign(new Error('Login required'),{status:401})}})
 const request={method:'POST',headers:new Headers({authorization:'Bearer qa-only','content-type':'multipart/form-data; boundary=fixture','x-webmobile-endpoint':'meter-ocr','x-webmobile-session':'11111111-1111-4111-8111-111111111111','x-webmobile-ip':'a'.repeat(64)}),formData:async()=>{order.push('formData');throw new Error('Form data must not be read')}}
 const response=await handler(request)
 assert.equal(response.status,401);assert.deepEqual(order,['session'])
})

test('gateway rejects an unauthenticated multipart upload before session, parser, RPC, or provider',async()=>{
 let sessions=0,forms=0
 const handler=cloudHandler(env,()=>{throw new Error('RPC must not run')},()=>{throw new Error('Provider must not run')},{session:async()=>{sessions++;throw new Error('Session must not run')}})
 const request={method:'POST',headers:new Headers({authorization:'Bearer wrong','content-type':'multipart/form-data; boundary=fixture','x-webmobile-endpoint':'meter-ocr','x-webmobile-session':'11111111-1111-4111-8111-111111111111','x-webmobile-ip':'a'.repeat(64)}),formData:async()=>{forms++;throw new Error('Form data must not be read')}}
 const response=await handler(request)
 assert.equal(response.status,403);assert.equal(sessions,0);assert.equal(forms,0)
})

test('missing persistence token cannot be reported as an automatic save',async()=>{
 const {request,calls}=fixture(profile,{rpc:async(name)=>name==='tenant_payment_state'?structuredClone(state):name==='webmobile_demo_quota'?true:{source:'ai-ocr'}})
 const response=await request('meter-ocr',{meter:'electric',image:'qa-photo'})
 assert.equal(response.status,409);assert.equal((await response.json()).ok,false)
 assert.equal(calls.some(c=>c.data.p_action==='confirm'),false)
})

for(const confirmation of [{invoiceId:'concurrent-invoice'},{source:'ai-ocr'},{source:'unknown',confirmationToken:'wrong-source'}])test('invalid or concurrent confirmation never claims success: '+JSON.stringify(confirmation),async()=>{
 const {request}=fixture(profile,{rpc:async(name,data)=>name==='tenant_payment_state'?structuredClone(state):name==='webmobile_demo_quota'?true:data.p_action==='photo'?{reviewToken:'private-photo'}:confirmation})
 const response=await request('meter-ocr',{mode:'check',meter:'electric',reading:110,reviewToken:'private-photo'})
 assert.equal(response.status,409);const body=await response.json();assert.equal(body.ok,false);assert.notEqual(body.autoConfirmed,true)
})
test('confirmation RPC failure never claims the reading was saved',async()=>{
 const {request}=fixture(profile,{rpc:async(name,data)=>{if(data.p_action==='confirm')throw new Error('database offline');return name==='tenant_payment_state'?structuredClone(state):name==='webmobile_demo_quota'?true:{reviewToken:'private-photo'}}})
 const response=await request('meter-ocr',{mode:'check',meter:'electric',reading:110,reviewToken:'private-photo'});assert.notEqual(response.status,200);assert.equal((await response.json()).ok,false)
})
for(const rejection of [{ok:false,code:'wrong_meter',reason:'wrong meter'},{ok:false,code:'multiple_meters',reason:'multiple meters'}])test('wrong meter photos never write or unlock manual: '+rejection.code,async()=>{
 const {request,calls}=fixture(profile,{reader:async()=>rejection})
 assert.equal((await (await request('meter-ocr',{meter:'electric',image:'qa-photo'})).json()).ok,false)
 assert.equal(calls.some(c=>['tenant_payment_write','tenant_payment_fallback'].includes(c.name)),false)
})
test('readable but abnormally high OCR does not write or auto-confirm',async()=>{
 const {request,calls}=fixture(profile,{reader:async()=>({ok:true,reading:999999,digits:'999999',unit:'kWh',source:'ai-ocr'})})
 const body=await (await request('meter-ocr',{meter:'electric',image:'qa-photo'})).json()
 assert.equal(body.assessment.status,'review');assert.notEqual(body.autoConfirmed,true);assert.equal(calls.some(c=>c.name==='tenant_payment_write'),false)
 assert.equal(calls.some(c=>c.name==='tenant_payment_fallback'&&c.data.p_action==='ocr_failure'),true)
})
test('BIDV virtual sub-account generates a QR without stripping its letters',async()=>{
 const local=structuredClone(state);local.bank.account='96247Q3PE9';local.invoices=[{id:'inv-web-1234567890abcdef',month:10,year:2026,total_amount:123400,paid_amount:0}]
 const {request}=fixture(profile,{rpc:async(name)=>name==='tenant_payment_state'?local:{}})
 const body=await (await request('tenant-payments',{action:'state'})).json();assert.equal(new URL(body.invoices[0].qr).searchParams.get('acc'),'96247Q3PE9')
})
test('create without an invoice ID is rejected rather than claimed successful',async()=>{
 const {request}=fixture(profile,{rpc:async(name)=>name==='tenant_payment_state'?structuredClone(state):{}})
 const response=await request('tenant-payments',{action:'create'});assert.equal(response.status,409);assert.equal((await response.json()).ok,false)
})
test('tenant cannot access demo or forge contract',async()=>{
 const {request,calls}=fixture();assert.equal((await request('demo-payments',{action:'create'})).status,403)
 assert.equal((await request('meter-ocr',{contractId:'another',meter:'electric'})).status,403);assert.equal(calls.length,0)
})
test('gateway authorization and demo roles cannot access real invoices',async()=>{
 assert.equal((await fixture().request('tenant-payments',{action:'state'},false)).status,403)
 assert.equal((await fixture({...profile,mode:'demo'}).request('tenant-payments',{action:'state'})).status,403)
})
test('backend owns money, QR and invoice creation rather than client payload',async()=>{
 state.invoices=[{id:'inv-web-1234567890abcdef',month:10,year:2026,total_amount:123400,paid_amount:400}]
 const {request,calls}=fixture();const r=await request('tenant-payments',{action:'state'}),s=await r.json()
 assert.equal(s.invoices[0].remaining,123000);assert.match(s.invoices[0].transferContent,/^P999T102026C/)
 const qr=new URL(s.invoices[0].qr);assert.equal(qr.searchParams.get('acc'),'123456789');assert.equal(qr.searchParams.get('amount'),'123000')
 await request('tenant-payments',{action:'create',total_amount:1,electric_old:0});assert.deepEqual(calls.at(-1).data.p_data,{})
 state.invoices=[]
})
test('bad manual reading is blocked before confirmation write',async()=>{
 const {request,calls}=fixture();const r=await request('meter-ocr',{mode:'check',meter:'water',reading:10000,reviewToken:'token'})
 assert.equal((await r.json()).ok,false);assert.equal(calls.some(c=>c.name==='tenant_payment_write'),false)
})
test('direct manual entry uses its own audited RPC and never creates a fake photo',async()=>{
 const {request,calls}=fixture()
 const response=await request('meter-ocr',{mode:'manual',meter:'electric',reading:110,cameraError:true,reviewToken:'forged'})
 assert.equal((await response.json()).ok,true)
 const write=calls.find(c=>c.name==='tenant_payment_fallback')
 assert.equal(write.data.p_user,profile.userId);assert.equal(write.data.p_cycle,state.cycle.id)
 assert.deepEqual(write.data.p_data,{meter:'electric',reading:110,cameraError:true})
 assert.equal(calls.some(c=>c.name==='tenant_payment_write'||c.name==='webmobile_demo_quota'),false)
})
test('bad direct manual entry never reaches the writing RPC',async()=>{
 const {request,calls}=fixture()
 assert.equal((await (await request('meter-ocr',{mode:'manual',meter:'water',reading:10000,cameraError:true})).json()).ok,false)
 assert.equal(calls.some(c=>c.name==='tenant_payment_fallback'),false)
})
