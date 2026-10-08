import { normalizeEmailNotificationPreferences } from '../../../src/renderer/src/lib/email-notification-preferences.ts'
import { inlineEmailAttachments, renderServerEmail, vietnamDate } from './email-renderer.ts'

type Data = Record<string, any>
export type MailEnvironment = {apiKey?: string;from?: string;replyTo?: string}
const assertQuery = <T>(result: {data: T;error: any}): T => {if(result.error)throw new Error(result.error.message);return result.data}

export async function refreshEmailJob(db: any, job: Data, now = new Date()): Promise<{job:Data;invoice?:Data;room?:Data}|null> {
  const user=assertQuery<Data>(await db.from('users').select('id,full_name,role,status,notification_email,email_notifications_enabled,email_notification_preferences').eq('id',job.recipient_user_id).maybeSingle())
  if(!user||user.status!=='active'||!['admin','user'].includes(user.role)||!user.notification_email?.trim()||!user.email_notifications_enabled||!normalizeEmailNotificationPreferences(user.email_notification_preferences)[job.event_type])return null
  // Recipient changes cannot redirect an already queued invoice to a different address.
  if(user.notification_email.trim().toLowerCase()!==job.recipient_email.trim().toLowerCase())return null
  const p=job.payload||{},today=vietnamDate(now)
  const invoice=p.invoiceId?assertQuery<Data>(await db.from('invoices').select('*').eq('id',p.invoiceId).maybeSingle()):undefined
  const room=p.roomId?assertQuery<Data>(await db.from('rooms').select('*').eq('id',p.roomId).maybeSingle()):undefined
  if(['rent_overdue','rent_long_unpaid','invoices_services'].includes(job.event_type)){
    if(p.invoiceId&&(!invoice||['paid','cancelled','merged'].includes(invoice.payment_status)||invoice.total_amount<=invoice.paid_amount))return null
    if(p.oldDebt&&(!room||Number(room.old_debt)<=0))return null
    if(job.event_type!=='invoices_services'&&p.dueDate>today)return null
    if(p.invoiceId&&job.event_type!=='invoices_services'&&invoice?.due_date&&invoice.due_date!==p.dueDate)return null
  }
  if(job.event_type==='room_checkout_due'&&(!room||room.status!=='ending'||room.expected_end_date!==p.dueDate||p.dueDate>today))return null
  if(job.event_type==='contract_expiring'){
    const c=assertQuery<Data>(await db.from('contracts').select('status,expiration_date').eq('id',p.contractId).maybeSingle())
    if(!c||c.status!=='active'||c.expiration_date!==p.dueDate||p.dueDate<today)return null
  }
  if(job.event_type==='sepay_matched'&&(!invoice||!(invoice.payment_records||[]).some((r:Data)=>r.id===p.record?.id)))return null
  if(job.event_type==='sepay_unmatched'){
    const normalize=(s:string)=>s.toUpperCase().replace(/[^A-Z0-9]/g,'')
    const tx=assertQuery<Data>(await db.from('sepay_server_transactions').select('status').eq('transaction_key',normalize(p.transactionKey)).maybeSingle())
    if(tx?.status==='recorded')return null
    const invoices=assertQuery<Data[]>(await db.from('invoices').select('payment_records'))
    if(invoices.some(i=>(i.payment_records||[]).some((r:Data)=>[r.external_ref,r.external_id].some(v=>v&&normalize(v)===normalize(p.transactionKey)))))return null
  }
  return {job:{...job,recipient_name:user.full_name},invoice,room}
}

export async function deliverServerEmails(db: any, env: MailEnvironment, options:{id?:string;limit?:number;fetch?:typeof fetch;pause?:(ms:number)=>Promise<void>}={}):Promise<Data> {
  if(!env.apiKey||!env.from)return {configured:false,sent:0,failed:0,skipped:0}
  const jobs=assertQuery<Data[]>(await db.rpc('claim_server_emails',{p_limit:options.limit||20,p_id:options.id||null}))
  const counts={configured:true,sent:0,failed:0,skipped:0,claimed:jobs.length}
  const request=options.fetch||fetch,pause=options.pause||(ms=>new Promise(resolve=>setTimeout(resolve,ms)))
  for(const [index,job] of jobs.entries()){
    if(index)await pause(600) // Resend's default rate limit is 2 requests/sec.
    let state='failed',messageId:string|null=null,error:string|null=null
    try {
      const live=await refreshEmailJob(db,job)
      if(!live){state='skipped';error='Điều kiện hoặc cài đặt nhận thư đã thay đổi.'}
      else {
        const mail=renderServerEmail(live.job,live.invoice as any,live.room)
        const response=await request('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`ankhang-email-${job.id}`},
          body:JSON.stringify({from:env.from,to:[job.recipient_email],subject:mail.subject,html:mail.html,text:mail.text,
            ...(env.replyTo?{reply_to:env.replyTo}:{}),attachments:inlineEmailAttachments(mail.html)}),signal:AbortSignal.timeout(15000)})
        const result=await response.json()
        if(!response.ok||!result.id)throw new Error(result.message||`Resend HTTP ${response.status}`)
        state='sent';messageId=result.id
      }
    } catch(cause){error=cause instanceof Error?cause.message:'Gửi email thất bại.'}
    // If provider accepted but persistence fails, the same delivery ID is retried, not a new email.
    const finished=await db.rpc('finish_server_email',{p_id:job.id,p_lease:job.lease_token,p_status:state,p_message:messageId,p_error:error})
    assertQuery(finished)
    if(finished.data!==true)throw new Error('Không lưu được kết quả gửi thư với lease hiện tại.')
    counts[state as 'sent'|'failed'|'skipped']++
  }
  return counts
}

export async function pollServerSepay(db:any,request:typeof fetch=fetch):Promise<Data> {
  const cfg=assertQuery<Data>(await db.from('email_automation_settings').select('*').eq('id',true).single())
  if(!cfg.enabled||!cfg.sepay_enabled)return {enabled:false}
  const secret=assertQuery<Data>(await db.from('app_secrets').select('sepay_api_token').eq('id','default').maybeSingle())
  if(!secret?.sepay_api_token)throw new Error('Chưa cấu hình SePay trên máy chủ.')
  const url=new URL('https://my.sepay.vn/userapi/transactions/list')
  const lowerBound = cfg.last_poll_at ? new Date(new Date(cfg.last_poll_at).getTime() - 2 * 60_000) : new Date(cfg.sepay_started_at)
  url.searchParams.set('transaction_date_min',lowerBound.toISOString().replace('T',' ').slice(0,19))
  url.searchParams.set('limit','1000')
  const response=await request(url,{headers:{Authorization:`Bearer ${secret.sepay_api_token}`,Accept:'application/json'},signal:AbortSignal.timeout(20000)})
  const body=await response.json()
  if(!response.ok||(body.status!==undefined&&Number(body.status)!==200))throw new Error(`SePay HTTP ${response.status}; không đồng bộ được giao dịch.`)
  if(!Array.isArray(body.transactions))throw new Error('SePay trả dữ liệu giao dịch không hợp lệ.')
  // The endpoint has a hard page cap. Refuse to advance the cursor when the
  // page is saturated so an unusually busy account cannot silently lose rows.
  if(body.transactions.length>=1000)throw new Error('SePay trả về đủ 1000 giao dịch; cần xử lý phân trang trước khi đồng bộ tiếp.')
  // Process oldest first to preserve balances for sequential transfers.
  const transactions=body.transactions.filter((t:Data)=>Number(t.amount_in)>0&&t.id&&t.transaction_date).sort((a:Data,b:Data)=>String(a.transaction_date).localeCompare(String(b.transaction_date))||String(a.id).localeCompare(String(b.id)))
  const counts:Data={enabled:true,processed:0}
  for(const tx of transactions){const answer=assertQuery<Data>(await db.rpc('process_server_sepay',{p_tx:tx}));counts[answer.status]=(counts[answer.status]||0)+1;counts.processed++}
  assertQuery(await db.from('email_automation_settings').update({last_poll_at:new Date().toISOString(),last_poll_error:null}).eq('id',true))
  return counts
}
