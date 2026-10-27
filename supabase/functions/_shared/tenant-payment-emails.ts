import { buildNotificationEmailLayout, getInvoiceEmailSnapshot } from '../../../src/renderer/src/lib/payment-success-email.ts'
import { buildMonthlyPaymentReminder } from '../../../src/shared/notification-email-layout.ts'
import { emailPlainText } from './email-renderer.ts'
import { inlineEmailAttachments } from './email-renderer.ts'
import type { MailEnvironment } from './email-worker.ts'

const value=(result:any)=>{if(result.error)throw new Error('Tenant mail query failed');return result.data}
const cash=(n:number)=>`${Number(n).toLocaleString('vi-VN')}đ`
const vietnamDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('/'):''
export async function deliverTenantPaymentEmails(db:any,env:MailEnvironment,fetcher=fetch) {
 if(!env.apiKey||!env.from) return {configured:false,sent:0}
 await db.rpc('queue_tenant_payment_emails').then(value)
 const jobs=value(await db.rpc('claim_tenant_payment_emails'))||[]
 let sent=0,failed=0,skipped=0
 for(const job of jobs) {
  // Share Resend's 2-request/sec limit with the preceding admin deliveries.
  await new Promise(resolve=>setTimeout(resolve,600))
  let status='failed',provider:string|null=null
  try {
   const cycle=value(await db.from('tenant_payment_cycles').select('*').eq('id',job.cycle_id).maybeSingle())
   const contract=cycle?value(await db.from('contracts').select('id,status,tenant_id,room_id').eq('id',cycle.contract_id).maybeSingle()):null
   const account=contract?value(await db.from('tenant_web_accounts').select('status,email').eq('tenant_id',contract.tenant_id).maybeSingle()):null
   const tenant=contract?value(await db.from('tenants').select('full_name,is_active').eq('id',contract.tenant_id).maybeSingle()):null
   const invoice=cycle?.invoice_id?value(await db.from('invoices').select('*').eq('id',cycle.invoice_id).maybeSingle()):null
   const room=contract?value(await db.from('rooms').select('name').eq('id',contract.room_id).maybeSingle()):null
   const superseded=job.kind==='receipt'&&cycle?.invoice_id
    ? value(await db.rpc('tenant_receipt_supersedes',{p_invoice:cycle.invoice_id})) : false
   const valid=!superseded&&contract?.status==='active'&&tenant?.is_active&&account?.status==='active'&&account.email.toLowerCase()===job.recipient.toLowerCase()
    &&(job.kind==='readings'?!cycle.invoice_id:job.kind==='receipt'?invoice?.payment_status==='paid':invoice&&!['paid','cancelled','merged'].includes(invoice.payment_status))
   if(!valid) {
    status='skipped'
   } else {
   const period=cycle.period.slice(0,7).split('-').reverse().join('/')
   const title=job.kind==='readings'?'Đến kỳ thanh toán':job.kind==='receipt'?'Thanh toán thành công':'Hóa đơn và dịch vụ'
   const subject=`[AN KHANG HOME] ${title} · ${period}`
   const introduction=job.kind==='receipt'?'Hệ thống đã ghi nhận thanh toán đầy đủ cho hóa đơn của bạn.':`Hóa đơn tháng ${period} đã sẵn sàng. Vui lòng kiểm tra các khoản phí và thanh toán đúng hạn.`
   const content=job.kind==='readings'
    ?buildMonthlyPaymentReminder({tenantName:tenant.full_name,room:room.name,period})
    :buildNotificationEmailLayout({title,template:job.kind==='receipt'?'02-thanh-toan-thanh-cong':'09-hoa-don-va-dich-vu',tone:job.kind==='receipt'?'success':'info',recipientName:tenant.full_name,introduction,
      highlight:cash(job.kind==='receipt'?invoice.paid_amount:Math.max(0,invoice.total_amount-invoice.paid_amount)),highlightLabel:job.kind==='receipt'?'Đã thanh toán':'Cần thanh toán',
      rows:[['Phòng',room.name],['Kỳ hóa đơn',period],...(vietnamDate(invoice.due_date)?[['Hạn thanh toán',vietnamDate(invoice.due_date)] as [string,string]]:[])],...getInvoiceEmailSnapshot(invoice),
      conclusion:job.kind==='receipt'?'Cảm ơn bạn đã thanh toán. Hóa đơn đã được thanh toán đầy đủ.':'Vui lòng thanh toán đúng thông tin trên trang thanh toán.'})
   const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`tenant-payment-${job.id}`},body:JSON.stringify({from:env.from,to:[job.recipient],subject,html:content,text:emailPlainText(content)+(job.kind==='readings'?'\nhttps://pay.phongtroankhang.com/?screen=payment':''),attachments:inlineEmailAttachments(content),...(env.replyTo?{reply_to:env.replyTo}:{})}),signal:AbortSignal.timeout(15000)})
   const result=await response.json()
   if(!response.ok||!result.id)throw new Error('Email provider failed')
   status='sent';provider=result.id
   }
  } catch {status='failed'}
  if(value(await db.rpc('finish_tenant_payment_email',{p_id:job.id,p_lease:job.lease,p_status:status,p_provider:provider}))!==true)throw new Error('Tenant email lease changed; delivery must retry with the same ID')
  if(status==='sent')sent++;else if(status==='skipped')skipped++;else failed++
 }
 return {configured:true,sent,failed,skipped}
}
