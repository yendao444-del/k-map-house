// Local QA of the actual production component. No real emails/accounts.
if (!import.meta.env.DEV) throw new Error('QA is available only in development.')
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProfileModal } from '../../src/renderer/src/components/ProfileModal'
import { supabase } from '../../src/renderer/src/lib/supabase'
import '../../src/renderer/src/assets/main.css'
import '../../src/renderer/src/components/account-profile.css'
const params = new URLSearchParams(location.search)
const client = new QueryClient({defaultOptions:{queries:{retry:false}}})
const user = {id:'fixture-admin',username:'admin_demo',email:'demo@example.invalid',full_name:'Tài khoản Demo',role:'admin' as const,status:'active' as const}
client.setQueryData(['users'], [user])
let verified = params.has('verified')
let readFailure = params.has('unknown')
let sendFailure = params.has('send-fail')
let sends = 0, verifies = 0, selfReads = 0
window.setInterval(() => {
  document.documentElement.dataset.qaStats = JSON.stringify({sends,verifies,selfReads,verified,usersInvalidated:client.getQueryState(['users'])?.isInvalidated})
}, 200)
supabase.auth.getSession = async () => ({data:{session:{access_token:'fixture-token',user:{id:user.id}}} as any,error:null})
supabase.auth.mfa.listFactors = async () => ({data:{all:[{id:'fixture-factor',factor_type:'totp',status:'verified'}]} as any,error:null})
supabase.rpc = ((name: string, _args: unknown, options: any) => {
  if (name !== 'management_user_directory') return Promise.resolve({data:{enrollment_enabled:true},error:null})
  let filtered = false, projected = false
  if (options?.get !== true) throw new Error('Profile must use a GET read')
  return {
    select(columns: string) { projected = columns === 'authenticator_verified,email_verified'; return this },
    eq(key: string, value: string) { filtered = key === 'id' && value === user.id; return this },
    async maybeSingle() {
      if (!filtered || !projected) throw new Error('Profile must filter/project its own status')
      selfReads++
      if (readFailure) { readFailure = false; return {data:null,error:{message:'Fixture read failure'}} }
      return {data:{authenticator_verified:true,email_verified:verified},error:null}
    }
  }
}) as any
const originalFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
  if (!init?.body || !String(init.body).includes('security_action')) return originalFetch(input, init)
  const body = JSON.parse(String(init.body)), action = body.security_action
  if (action === 'status') return Response.json({ok:true,state:'ready',recent_mfa:params.has('fresh')})
  if (action === 'overview') {
    const count = params.has('many') ? 24 : params.has('populated') ? 2 : 0
    const expiry = new Date(Date.now()+86400000).toISOString()
    const created = new Date().toISOString()
    return Response.json({
      devices:Array.from({length:count},(_,i)=>({id:'fixture-device-'+i,label:i===0?'Điện thoại của tôi':'Máy tính của tôi',expires_at:expiry})),
      sessions:Array.from({length:count},(_,i)=>({id:'fixture-session-'+i,current:i===0,last_activity_at:created,expires_at:expiry})),
      events:Array.from({length:count},(_,i)=>({id:'fixture-event-'+i,event_type:'email_challenge_verified',success:true,created_at:created}))
    })
  }
  if (action === 'email_send') {
    sends++
    if (JSON.stringify(body.data) !== '{"purpose":"signin"}') throw new Error('Unexpected recipient or payload')
    if (sendFailure) { sendFailure=false; return Response.json({error:'Chưa gửi được email. Vui lòng thử lại.'},{status:503}) }
    return Response.json({ok:true,challenge_id:'fixture-email-'+sends,masked_email:'d***@example.invalid'})
  }
  if (action === 'email_verify') {
    verifies++
    if (body.data.purpose !== 'signin' || !String(body.data.challenge_id).startsWith('fixture-email-')) throw new Error('Invalid challenge')
    if (body.data.code !== '123456') return Response.json({error:'Mã email không đúng hoặc đã hết hạn.'},{status:400})
    verified=true
    return Response.json({ok:true})
  }
  return Response.json({ok:true})
}
function QA() {
  const [stats,setStats] = useState('')
  return <main style={{minHeight:'100dvh',background:'#64748b'}}>
    <ProfileModal currentUser={user} initialSection={params.has('profile') ? 'profile' : 'security'} onClose={()=>{}} onUpdate={()=>{}} />
    <button style={{position:'fixed',bottom:0,left:0,zIndex:1}} onClick={()=>setStats(JSON.stringify({sends,verifies,selfReads,verified,usersInvalidated:client.getQueryState(['users'])?.isInvalidated}))}>Kiểm tra fixture</button>
    <output style={{position:'fixed',bottom:0,right:0,zIndex:1,fontSize:10}}>{stats}</output>
  </main>
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><QA/></QueryClientProvider>)
