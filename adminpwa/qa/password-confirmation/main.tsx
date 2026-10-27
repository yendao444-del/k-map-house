// Local Vite QA entry only; excluded from the production build.
if (!import.meta.env.DEV) throw new Error('QA is available only in development.')
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePasswordConfirmation } from '../../src/renderer/src/components/PasswordConfirmationDialog'
import { SettingsTab } from '../../src/renderer/src/components/SettingsTab'
import { ProfileModal } from '../../src/renderer/src/components/ProfileModal'
import { supabase } from '../../src/renderer/src/lib/supabase'
import '../../src/renderer/src/assets/main.css'
import '../../src/renderer/src/components/account-profile.css'
const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity,refetchOnMount:false}}})
const user={id:'fixture-admin',username:'admin_demo',email:'admin@example.invalid',full_name:'Quản trị viên Demo',role:'admin' as const,status:'active' as const}
client.setQueryData(['users'],[user,{...user,id:'fixture-staff',username:'staff_demo',full_name:'Nhân viên Demo',role:'user'}])
client.setQueryData(['gmail-availability-global'],{available:false})
window.api={gmail:{getAvailability:async()=>({available:false})}} as any
supabase.auth.getSession=async()=>({data:{session:{access_token:'fixture-token'}} as any,error:null})
supabase.auth.mfa.listFactors=async()=>({data:{all:[{id:'fixture-factor',factor_type:'totp',status:'verified'}]} as any,error:null})
supabase.rpc=async()=>({data:{enrollment_enabled:true},error:null}) as any
window.fetch=async(input,init)=>{
 const body=init?.body?JSON.parse(String(init.body)):{}
 if(body.security_action==='status')return Response.json({ok:true,state:'ready',recent_mfa:false})
 if(body.security_action==='password_status')return Response.json({ok:true,recent_password:false})
 if(body.security_action==='password_confirm'||body.security_action==='password_change')return Response.json(body.data.password==='demo-correct-password'?{ok:true,recent_password:true}:{ok:false,error:'Mật khẩu hiện tại không đúng.'},{status:body.data.password==='demo-correct-password'?200:401})
 return Response.json({ok:true})
}
function QA(){const {requirePassword,passwordConfirmation}=usePasswordConfirmation();const [result,setResult]=useState(''); const view=new URLSearchParams(location.search).get('view')
 if(view==='users')return <SettingsTab currentUser={user} initialTab="users" />
 if(view==='profile')return <ProfileModal currentUser={user} initialSection="security" onClose={()=>{}} onUpdate={()=>{}} />
 return <div className="min-h-screen bg-slate-50 p-6"><h1 className="text-2xl font-bold">AN KHANG HOME</h1><p className="my-3">Kiểm tra xác nhận mật khẩu với dữ liệu giả lập</p><button className="rounded-xl bg-blue-600 p-3 text-white" onClick={()=>void requirePassword('Ghi nhận khoản tiền SePay vào hóa đơn').then(()=>setResult('Đã xác nhận')).catch(()=>setResult('Đã hủy'))}>Ghi nhận SePay</button><p role="status">{result}</p>{passwordConfirmation}</div>
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><QA/></QueryClientProvider>)
