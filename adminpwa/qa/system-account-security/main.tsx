// Development fixture only; no real accounts or remote calls.
if (!import.meta.env.DEV) throw new Error('QA is available only in development.')
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsTab } from '../../src/renderer/src/components/SettingsTab'
import { supabase } from '../../src/renderer/src/lib/supabase'
import '../../src/renderer/src/assets/main.css'
import '../../src/renderer/src/assets/mobile.css'
import '../../src/renderer/src/assets/font-awesome.css'
import '../../src/renderer/src/components/account-profile.css'

const rows = [
  { id: 'fixture-admin', username: 'minhan', full_name: 'Nguyễn Minh An', email: 'minhan@example.com', role: 'admin', status: 'active', authenticator_verified: true, email_verified: true },
  { id: 'fixture-other', username: 'hainam', full_name: 'Trần Hải Nam', email: 'hainam@example.com', role: 'admin', status: 'active', authenticator_verified: false, email_verified: true },
  { id: 'fixture-staff', username: 'thuha', full_name: 'Lê Thu Hà', email: 'thuha@example.com', role: 'user', status: 'active', authenticator_verified: true, email_verified: false }
].map(user => ({ ...user, created_at: '2026-10-01T00:00:00Z', last_login_at: '2026-10-12T02:08:00Z' }))
if (new URLSearchParams(location.search).has('unknown')) {
  rows[1].authenticator_verified = undefined as any
  rows[1].email_verified = undefined as any
}
;(window as any).qaDirectoryRows = rows
let failDirectoryRead = new URLSearchParams(location.search).has('error')
supabase.rpc = ((name: string) => {
  if (name !== 'management_user_directory') throw new Error('Unexpected fixture RPC: ' + name)
  return { order: async () => {
    if (failDirectoryRead) {
      failDirectoryRead = false
      return { data: null, error: { code: '42501', message: 'Management MFA/session verification required' } }
    }
    return { data: (window as any).qaDirectoryRows, error: null }
  } }
}) as any
window.api = { gmail: { getAvailability: async () => ({ available: true }) } } as any
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
client.setQueryData(['gmail-availability-global'], { available: true })
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <div className="pwa-app flex flex-col"><main className="pwa-main-content pwa-mobile-main flex min-h-0 flex-1"><SettingsTab currentUser={{ ...rows[0], role: 'admin', status: 'active' }} initialTab="users" /></main></div>
  </QueryClientProvider>
)
