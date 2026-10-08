import {createClient} from 'https://esm.sh/@supabase/supabase-js@2'
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
Deno.serve(async req=>{
 if(req.method!=='POST')return Response.json({success:false},{status:405})
 const key=Deno.env.get('SEPAY_WEBHOOK_API_KEY')
 if(!key||req.headers.get('authorization')!==`Apikey ${key}`)return Response.json({success:false},{status:401})
 if(Number(req.headers.get('content-length')||0)>64000)return Response.json({success:false},{status:413})
 try{
  const text=await req.text();if(text.length>64000)return Response.json({success:false},{status:413})
  const p=JSON.parse(text)
  if(p.transferType!=='in')return Response.json({success:true,status:'ignored'})
  if(!Number.isSafeInteger(p.transferAmount)||p.transferAmount<=0||!p.id||!p.transactionDate||!p.accountNumber)return Response.json({success:false,error:'Invalid transaction'},{status:400})
  const {data,error}=await db.rpc('process_server_sepay',{p_tx:{id:String(p.id),reference_number:p.referenceCode,
    amount_in:p.transferAmount,transaction_content:p.content||'',transaction_date:p.transactionDate,account_number:p.accountNumber}})
  if(error)throw error
  // Durable DB queue; scheduled worker sends the email even if this request ends here.
  return Response.json({success:true,...data})
 }catch{return Response.json({success:false,error:'Processing failed'},{status:500})}
})
