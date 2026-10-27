// Development-only fixture. The production build does not include this entry.
if (!import.meta.env.DEV) throw new Error('Development only')
import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {SecurityAccessPanel} from '../../src/renderer/src/components/SecurityAccessPanel'
import {supabase} from '../../src/renderer/src/lib/supabase'
import '../../src/renderer/src/assets/main.css'
const scenario=new URLSearchParams(location.search).get('scenario')||'returning'
let emailVerified=false,failStatus=scenario==='error'
;(window as any).qaSecurityCalls=[]
supabase.auth.getSession=async()=>({data:{session:{access_token:'qa-token'}} as any,error:null})
window.fetch=async(_input,init)=>{
 const payload=JSON.parse(String(init?.body||'{}')), action=payload.security_action
 ;(window as any).qaSecurityCalls.push(action)
 if(action==='status'){
  await new Promise(resolve=>setTimeout(resolve,150))
  if(failStatus){failStatus=false;return Response.json({ok:false,error:'Không thể tải trạng thái bảo mật.'},{status:503})}
  return Response.json({ok:true,state:emailVerified?(scenario==='new'?'recovery_codes':'authorize'):'email',factor_id:'fixture-factor',recovery_acknowledged:scenario!=='new'})
 }
 if(action==='email_send')return Response.json({ok:true,challenge_id:'qa-email',masked_email:'q***@example.invalid'})
 if(action==='email_verify'){emailVerified=true;return Response.json({ok:true})}
 if(action==='authorize')return Response.json({ok:true})
 throw new Error('Unexpected fixture action: '+action)
}
function QA(){const [done,setDone]=useState(false);return <div className="flex min-h-screen items-center justify-center bg-slate-800 p-4"><div className="account-surface account-login-security">{done?<p role="status">Đăng nhập thành công</p>:<SecurityAccessPanel initialState="email" onComplete={async()=>setDone(true)} onCancel={async()=>{}}/>}</div></div>}
createRoot(document.getElementById('root')!).render(<QA/> )
