import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NewContractPage from '../../../src/renderer/src/components/NewContractPage'
import { room } from '../contract/fixtures'
import { events, params, record } from './events'
import '../../../src/renderer/src/assets/main.css'
// All dependencies are local fixtures. No Supabase write or email IPC is used.
Object.assign(window, { api: { gmail: {
  getAvailability: async () => ({ available: true, authenticated: !params.has('disconnected'), senderEmail: 'sender@example.com' }),
  sendNotification: async () => { record('Gửi Gmail mô phỏng'); await new Promise(resolve => setTimeout(resolve, 500)); return { ok: true, messageId: 'qa-message' } },
  reauthenticate: async () => ({ ok: false, error: 'QA không đăng nhập Gmail thật.' })
} } })
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
function QA() {
  const [log, setLog] = useState('')
  useEffect(() => { const update = () => setLog(events.join(' → ')); window.addEventListener('qa-operation', update); return () => window.removeEventListener('qa-operation', update) }, [])
  return <div className="flex h-screen flex-col"><header className="shrink-0 border-b bg-white px-6 py-2 text-xs">QA biệt lập · Không gửi email thật / không ghi Supabase<output className="ml-4" data-testid="qa-operation-log">{log}</output></header><NewContractPage room={room} initialTenantId="qa-tenant" zone={{ id: 'qa-zone', name: 'Khu A', electric_price: 3500, water_price: 25000, internet_price: 100000, cleaning_price: 30000, created_at: '2026-10-05' }} onClose={() => {}} onNavigateToTenants={() => {}} onNavigateToAssets={() => {}} /></div>
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><QA /></QueryClientProvider>)
