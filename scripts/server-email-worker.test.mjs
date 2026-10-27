import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({entryPoints:['supabase/functions/_shared/email-worker.ts'],bundle:true,write:false,format:'esm',platform:'node',target:'es2022'})
const { refreshEmailJob, deliverServerEmails, fetchSepayWindow } = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const user = {id:'u',full_name:'Synthetic Admin',role:'admin',status:'active',notification_email:'fake@example.invalid',email_notifications_enabled:true,email_notification_preferences:{rent_overdue:true,sepay_matched:true,sepay_unmatched:true}}
const invoice = {id:'invoice',room_id:'room',month:9,year:2026,total_amount:1000,paid_amount:0,payment_status:'unpaid',due_date:'2026-01-15',payment_records:[]}
const job = {id:'delivery',recipient_user_id:'u',recipient_email:user.notification_email,event_type:'rent_overdue',lease_token:'lease',subject:'Synthetic reminder',payload:{invoiceId:'invoice',roomId:'room',dueDate:invoice.due_date},attempts:1}

function dbMock(overrides={}) {
  const finished=[]; const tables={users:user,invoices:invoice,rooms:{id:'room',name:'Synthetic 999',old_debt:500},...overrides}
  return {
    finished,
    from(table){const chain={}; for(const op of ['select','eq','maybeSingle','single'])chain[op]=()=>chain;chain.then=(ok)=>Promise.resolve({data:tables[table],error:null}).then(ok);return chain},
    async rpc(name,args){if(name==='claim_server_emails')return {data:[job],error:null};if(name==='finish_server_email'){finished.push(args);return {data:true,error:null}};throw new Error('Unexpected RPC')}
  }
}

test('missing provider config never claims jobs or makes a provider request',async()=>{
 const db={rpc(){throw new Error('Do not claim')}}
 assert.equal((await deliverServerEmails(db,{})).configured,false)
})
test('current opt-out or changed recipient blocks delivery',async()=>{
 assert.equal(await refreshEmailJob(dbMock({users:{...user,email_notifications_enabled:false}}),job),null)
 assert.equal(await refreshEmailJob(dbMock({users:{...user,notification_email:'other@example.invalid'}}),job),null)
})
test('paid/cancelled invoices and changed due dates are skipped before sending',async()=>{
 for(const i of [{...invoice,payment_status:'paid',paid_amount:1000},{...invoice,payment_status:'cancelled'},{...invoice,due_date:'2026-12-20'}])assert.equal(await refreshEmailJob(dbMock({invoices:i}),job),null)
 const db=dbMock({invoices:{...invoice,paid_amount:1000,payment_status:'paid'}})
 const result=await deliverServerEmails(db,{apiKey:'synthetic-key',from:'Synthetic <fake@example.invalid>'},{fetch:()=>{throw new Error('Do not send')}})
 assert.equal(result.skipped,1);assert.equal(db.finished[0].p_status,'skipped')
})
test('payment receipt is skipped when the recorded SePay payment is cancelled or changed',async()=>{
 const receipt={...job,event_type:'sepay_matched',payload:{invoiceId:'invoice',roomId:'room',transactionKey:'BANK-1',record:{id:'record-1',amount:1000,source:'sepay'}}}
 const paid={...invoice,payment_status:'paid',paid_amount:1000,payment_records:[{id:'record-1',amount:1000,source:'sepay',external_ref:'BANK-1'}]}
 assert.ok(await refreshEmailJob(dbMock({invoices:paid}),receipt))
 for(const changed of [
  {...paid,payment_status:'cancelled'},
  {...paid,payment_records:[{id:'record-1',amount:999,source:'sepay',external_ref:'BANK-1'}]},
  {...paid,payment_records:[{id:'record-1',amount:1000,source:'manual',external_ref:'BANK-1'}]},
  {...paid,payment_records:[{id:'record-1',amount:1000,source:'sepay',external_ref:'OTHER'}]}
 ]) assert.equal(await refreshEmailJob(dbMock({invoices:changed}),receipt),null)
})
test('provider retry uses the same delivery idempotency key and includes text and CID assets',async()=>{
 const db=dbMock();const requests=[]
 const response=async(url,init)=>{requests.push({url,headers:init.headers,body:JSON.parse(init.body)});return Response.json({id:'synthetic-provider-id'})}
 for(let n=0;n<2;n++)assert.equal((await deliverServerEmails(db,{apiKey:'synthetic-key',from:'Synthetic <fake@example.invalid>'},{fetch:response})).sent,1)
 assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key'])
 assert.ok(requests[0].body.text);assert.ok(requests[0].body.attachments.length);assert.ok(requests[0].body.attachments.every(a=>a.content_id&&a.content))
 assert.equal(db.finished[0].p_message,'synthetic-provider-id')
})
test('provider rejection records a retryable failure without inventing success',async()=>{
 const db=dbMock();const result=await deliverServerEmails(db,{apiKey:'synthetic-key',from:'Synthetic <fake@example.invalid>'},{fetch:async()=>Response.json({message:'Synthetic provider rate limit'},{status:429})})
 assert.equal(result.sent,0);assert.equal(result.failed,1);assert.equal(db.finished[0].p_status,'failed');assert.match(db.finished[0].p_error,/rate limit/)
})
test('accepted email with failed persistence stops; never allocates a new delivery key',async()=>{
 const db=dbMock();const original=db.rpc;db.rpc=async(name,args)=>name==='finish_server_email'?{data:null,error:{message:'Synthetic persistence failure'}}:original(name,args)
 let sends=0
 await assert.rejects(deliverServerEmails(db,{apiKey:'synthetic-key',from:'Synthetic <fake@example.invalid>'},{fetch:async()=>{sends++;return Response.json({id:'accepted'})}}),/persistence failure/)
 assert.equal(sends,1)
})
test('SePay time filters use Vietnam time and split saturated windows without losing rows',async()=>{
 const requests=[];const row=id=>({id:String(id),transaction_date:'2026-10-08 08:00:00',amount_in:'1000'})
 const response=async(url)=>{const u=new URL(url);requests.push(u); if(requests.length===1)return Response.json({status:200,transactions:Array.from({length:1000},(_,i)=>row(i))}); return Response.json({status:200,transactions:requests.length===2?[row(1),row(2)]:[row(2),row(3)]})}
 const result=await fetchSepayWindow('synthetic-key',Date.parse('2026-10-08T01:00:00Z'),Date.parse('2026-10-08T02:00:00Z'),response)
 assert.equal(requests[0].searchParams.get('transaction_date_min'),'2026-10-08 08:00:00')
 assert.equal(requests[0].searchParams.get('transaction_date_max'),'2026-10-08 09:00:00')
 assert.deepEqual(result.map(r=>r.id),['1','2','3']);assert.equal(requests.length,3)
})
test('SePay malformed or saturated one-second response fails instead of silently advancing',async()=>{
 await assert.rejects(fetchSepayWindow('synthetic-key',0,1000,async()=>Response.json({status:200,transactions:Array(1000).fill({id:'1'})})),/một giây/)
 await assert.rejects(fetchSepayWindow('synthetic-key',0,1000,async()=>Response.json({status:200})),/không hợp lệ/)
})
