import {test} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const bundle=await build({entryPoints:['supabase/functions/_shared/tenant-payment-emails.ts'],bundle:true,write:false,format:'esm',platform:'node',target:'es2022'})
const {deliverTenantPaymentEmails}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const job={id:'qa-mail',lease:'qa-lease',cycle_id:'qa-cycle',kind:'readings',recipient:'synthetic@example.invalid',attempts:1}
function fixture(changes={},jobs=[job],superseded=false) {
 const results=[],tables={tenant_payment_cycles:{contract_id:'contract',period:'2026-10-01',invoice_id:null},contracts:{status:'active',tenant_id:'tenant',room_id:'room'},tenant_web_accounts:{status:'active',email:job.recipient},tenants:{full_name:'QA <script>alert(1)</script>',is_active:true},rooms:{name:'999'},...changes}
 const db={from(name){const chain={select:()=>chain,eq:()=>chain,maybeSingle:()=>chain,then:ok=>Promise.resolve({data:tables[name],error:null}).then(ok)};return chain},async rpc(name,args){if(name==='queue_tenant_payment_emails')return {data:1};if(name==='claim_tenant_payment_emails')return {data:jobs};if(name==='tenant_receipt_supersedes')return {data:superseded};results.push(args);return {data:true}}}
 return {db,results}
}
test('tenant mail stays inert without provider configuration',async()=>{assert.equal((await deliverTenantPaymentEmails({rpc(){throw new Error('must not write')}},{})).configured,false)})
test('current account/contract and recipient are rechecked before sending',async()=>{
 for(const changes of [{contracts:{status:'cancelled'}},{tenant_web_accounts:{status:'locked',email:job.recipient}},{tenant_web_accounts:{status:'active',email:'different@example.invalid'}}]){
 const f=fixture(changes);const result=await deliverTenantPaymentEmails(f.db,{apiKey:'qa-only',from:'QA'},async()=>{throw new Error('must not send')});assert.equal(result.skipped,1);assert.equal(f.results[0].p_status,'skipped')}
})
test('tenant email contains branded inline assets, direct payment link and an escaped name',async()=>{
 const f=fixture(),sent=[];const result=await deliverTenantPaymentEmails(f.db,{apiKey:'qa-only',from:'QA'},async(url,opts)=>{sent.push(JSON.parse(opts.body));return Response.json({id:'qa-provider'})})
 assert.equal(result.sent,1);assert.match(sent[0].html,/href="https:\/\/pay.phongtroankhang.com\/\?screen=payment"/);assert.doesNotMatch(sent[0].html,/<script>/);assert.ok(sent[0].attachments.length);assert.equal(f.results[0].p_provider,'qa-provider')
 assert.match(sent[0].subject,/Đến kỳ thanh toán/)
 assert.match(sent[0].html,/chụp số điện và nước trước/)
 assert.doesNotMatch(sent[0].html,/Chi tiết hóa đơn|Tổng hóa đơn|Cần thanh toán|Còn phải thanh toán|Đến kỳ ghi số/)
 assert.equal(sent[0].attachments[0].content_id,'15-den-ky-thanh-toan@ankhanghome')
})
test('provider error produces retryable failure, not fake success',async()=>{
 const f=fixture();const result=await deliverTenantPaymentEmails(f.db,{apiKey:'qa-only',from:'QA'},async()=>Response.json({message:'qa rejected'},{status:429}));assert.equal(result.failed,1);assert.equal(result.sent,0);assert.equal(f.results[0].p_status,'failed')
})
test('monthly cycle skips its small receipt when the full transaction receipt exists',async()=>{
 const f=fixture({tenant_payment_cycles:{contract_id:'contract',period:'2026-10-01',invoice_id:'invoice'},invoices:{payment_status:'paid'}},[{...job,kind:'receipt'}],true)
 const result=await deliverTenantPaymentEmails(f.db,{apiKey:'qa-only',from:'QA'},async()=>{throw new Error('duplicate must not send')})
 assert.equal(result.skipped,1);assert.equal(f.results[0].p_status,'skipped')
})
test('tenant invoice states the stored payment deadline',async()=>{
 const f=fixture({tenant_payment_cycles:{contract_id:'contract',period:'2026-10-01',invoice_id:'invoice'},invoices:{month:10,year:2026,total_amount:1000,paid_amount:0,payment_status:'unpaid',room_cost:1000,due_date:'2026-10-15'}},[{...job,kind:'invoice'}])
 const sent=[]
 await deliverTenantPaymentEmails(f.db,{apiKey:'qa-only',from:'QA'},async(_url,opts)=>{sent.push(JSON.parse(opts.body));return Response.json({id:'qa-provider'})})
 assert.match(sent[0].html,/Hạn thanh toán/)
 assert.match(sent[0].html,/15\/10\/2026/)
})
