import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContractsTab } from '../../../src/renderer/src/components/ContractsTab'
import NewContractPage from '../../../src/renderer/src/components/NewContractPage'
import type { ContractDraft } from '../../../src/renderer/src/lib/contract-draft'
import type { Room } from '../../../src/renderer/src/lib/db'
import '../../../src/renderer/src/assets/main.css'

const client = new QueryClient({defaultOptions:{queries:{retry:false}}})
function QA() {
  const [selected,setSelected] = useState<{room:Room;draft?:ContractDraft}|null>(null)
  return <div className="flex h-screen flex-col bg-[var(--brand-canvas)]"><header className="flex h-14 shrink-0 items-center gap-8 border-b border-[var(--brand-border)] bg-white px-6"><strong className="text-[var(--brand-shell)]">AN KHANG HOME</strong><span className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Hợp đồng</span><span className="ml-auto text-[11px] text-[var(--brand-muted)]">QA biệt lập · Không gửi email / không ghi Supabase</span></header>{selected ? <NewContractPage room={selected.room} initialDraft={selected.draft} zone={{id:'qa-zone',name:'Khu A',electric_price:3500,water_price:25000,internet_price:100000,cleaning_price:30000,created_at:'2026-10-05'}} onClose={()=>setSelected(null)} onNavigateToTenants={()=>setSelected(null)} onNavigateToAssets={()=>setSelected(null)} /> : <ContractsTab onCreateContract={(room,draft)=>setSelected({room,draft})} />}</div>
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><QA /></QueryClientProvider>)
