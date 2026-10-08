import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { deliverServerEmails, pollServerSepay } from '../_shared/email-worker.ts'

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
const mailEnv=()=>({apiKey:Deno.env.get('RESEND_API_KEY'),from:Deno.env.get('MAIL_FROM'),replyTo:Deno.env.get('MAIL_REPLY_TO')})
Deno.serve(async req=>{
  if(req.method!=='POST')return Response.json({ok:false,error:'Method not allowed'},{status:405})
  const secret=Deno.env.get('EMAIL_AUTOMATION_SECRET')
  if(!secret||req.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({ok:false,error:'Unauthorized'},{status:401})
  try {
    const {data:cfg,error}=await db.from('email_automation_settings').select('enabled,sepay_enabled,last_worker_at,last_poll_at,last_poll_error').eq('id',true).single()
    if(error)throw error
    const input=await req.json().catch(()=>({}))
    if(input.action==='status')return Response.json({ok:true,...cfg,configured:Boolean(mailEnv().apiKey&&mailEnv().from)})
    if(!cfg.enabled)return Response.json({ok:true,enabled:false,configured:Boolean(mailEnv().apiKey&&mailEnv().from)})
    let sepay:Record<string,unknown>
    try{sepay=await pollServerSepay(db)}catch(cause){sepay={error:'Đồng bộ SePay thất bại.'};await db.from('email_automation_settings').update({last_poll_error:cause instanceof Error?cause.message:'SePay failed'}).eq('id',true)}
    const {data:queued,error:queueError}=await db.rpc('enqueue_due_server_emails')
    if(queueError)throw queueError
    const delivery=await deliverServerEmails(db,mailEnv())
    await db.from('email_automation_settings').update({last_worker_at:new Date().toISOString()}).eq('id',true)
    return Response.json({ok:true,queued,sepay,delivery})
  }catch(cause){console.error('Email automation failed:',cause instanceof Error?cause.message:'Worker error');return Response.json({ok:false,error:'Xử lý email trên máy chủ thất bại.'},{status:500})}
})
