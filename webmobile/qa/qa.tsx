import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TenantFormModal } from '../../src/renderer/src/components/TenantFormModal'
import '../../src/renderer/src/assets/main.css'

window.api = { tenantIdentity: {
  read: async (dataUrl: string) => (await fetch('/qa-api/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl})})).json(),
  clipboard: async () => (await (await fetch('/qa-api/fixture')).json()).dataUrl
}} as Window['api']

function QA() {
  const [open,setOpen]=useState(true)
  const [pending,setPending]=useState(false)
  const [status,setStatus]=useState('Kiểm thử độc lập · dữ liệu không ghi vào Supabase')
  const [count,setCount]=useState(0)
  return <main className="min-h-screen bg-[var(--brand-canvas)] p-8">
    <h1 className="mb-4 text-xl font-bold">Danh sách khách thuê</h1>
    <p role="status">{status}</p>
    <button className="mt-4 rounded-lg bg-primary px-4 py-2 text-white" onClick={()=>{setOpen(true);setCount(count+1)}}>Thêm khách thuê</button>
    {open && <TenantFormModal key={count} onClose={()=>setOpen(false)} isPending={pending} onSubmit={async data=>{
      setPending(true)
      try {const result=await (await fetch('/qa-api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})).json();if(!result.ok) throw new Error();setStatus('Đã lưu hồ sơ thử nghiệm và ảnh giấy tờ');setOpen(false)}
      catch {setStatus('Lưu thử nghiệm thất bại')}
      finally {setPending(false)}
    }} />}
  </main>
}
createRoot(document.getElementById('root')!).render(<QA />)
