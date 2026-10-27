import { useEffect, useState } from 'react'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TenantFormModal } from '../components/TenantFormModal'
import { TenantsTab } from '../components/TenantsTab'
import type { Tenant } from '../lib/db'
import demoStrip from './tenant-demo-strip.png'
import demoFront from '../../../../qa/tenant-edit/front-demo.png'
import { supabase } from '../lib/supabase'

// DEV-only surface: fictional documents, no Auth, tenant mutations or email checks.
const client = new QueryClient({
  // List interactions use the real components but must never mutate a tenant.
  mutationCache: new MutationCache({ onMutate: () => { throw new Error('Bản QA dữ liệu mẫu không ghi vào cơ sở dữ liệu.') } }),
  defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnMount: false, refetchOnWindowFocus: false } }
})
const baseTenant: Tenant = {
  id: 'fixture-tenant', full_name: 'Nguyễn Văn A', identity_card: '001234567890',
  phone: '0901234526', email: '', notes: '',
  address: 'Địa chỉ giả lập', is_active: true, identity_image_url: demoStrip,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-10T00:00:00Z'
}
export default function TenantVisualHarness() {
  const [listView, setListView] = useState(new URLSearchParams(window.location.search).get('view') === 'list')
  const [mode, setMode] = useState<'edit' | 'add' | null>('edit')
  const [tenant, setTenant] = useState(baseTenant)
  const [saved, setSaved] = useState<string>('')
  const [scenario, setScenario] = useState('success')
  const [pending, setPending] = useState(false)
  useState(() => {
    const names = ['Nguyễn An', 'Trần Bình', 'Lê Chi', 'Phạm Dũng', 'Võ Hà']
    const emails = ['an@example.com', 'binh@example.com', '', 'dung@example.com', 'ha@example.com']
    const demoTenants = names.map((name, index) => ({ ...baseTenant, id: `fixture-${index}`, full_name: name, phone: index === 3 ? '' : `090000000${index + 1}`, email: emails[index], identity_card: index === 1 ? '' : `07900000000${index + 1}`, identity_image_url: index === 1 ? undefined : index === 2 ? demoFront : demoStrip, created_at: `2026-10-${String(10 - index).padStart(2, '0')}T00:00:00Z` }))
    client.setQueryData(['tenants'], demoTenants)
    client.setQueryData(['rooms'], names.map((_, index) => ({ id: `room-${index}`, name: `Phòng ${101 + index}` })))
    client.setQueryData(['contracts'], names.map((_, index) => ({ id: `contract-${index}`, tenant_id: `fixture-${index}`, room_id: `room-${index}`, status: 'active', move_in_date: '2026-10-01', created_at: '2026-10-01', deposit_amount: 2200000 + index * 100000, deposit_pre_collected: true })))
    client.setQueryData(['invoices'], [])
    return true
  })
  useEffect(() => {
    const original = supabase.rpc
    supabase.rpc = (async () => ({ data: { allowed: true }, error: null })) as unknown as typeof supabase.rpc
    return () => { supabase.rpc = original }
  }, [])
  useEffect(() => {
    let count = 0
    const original = window.api.tenantIdentity
    window.api.tenantIdentity = {
      read: async () => {
        const order = ++count
        await new Promise(resolve => setTimeout(resolve, scenario === 'slow' ? 4000 : 300))
        if (scenario === 'failure') return { ok: false, error: 'Ảnh mờ giả lập. Hãy chọn ảnh rõ hơn.' }
        return { ok: true, source: order % 2 ? 'ocr' : 'qr', needsReview: true,
          fields: { fullName: 'Nguyễn Văn A', identityCard: scenario === 'conflict' && order % 2 === 0 ? '009876543210' : '001234567890', address: 'Địa chỉ mới giả lập', issuedDate: '2021-01-01' } }
      },
      clipboard: async () => null
    }
    return () => { window.api.tenantIdentity = original }
  }, [scenario, mode])
  function save(data: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>) {
    setPending(true)
    setTimeout(() => {
      setSaved(JSON.stringify({ ...data, identity_image_url: data.identity_image_url ? '[ảnh đã lưu]' : undefined }))
      setTenant({ ...tenant, ...data })
      setPending(false)
      setMode(null)
    }, 300)
  }
  return <QueryClientProvider client={client}><div className="pwa-app flex h-dvh flex-col bg-[var(--brand-canvas)]">
    {listView ? <TenantsTab /> : <>
    <header className="border-b bg-white p-5 font-bold text-[var(--brand-shell)]">AN KHANG HOME · Khách thuê · QA dữ liệu giả</header>
    <main className="p-6"><h1 className="mb-5 text-2xl font-bold">Quản lý khách thuê</h1><div className="flex flex-wrap gap-3">
      <button className="rounded-lg bg-primary p-3 text-white" onClick={() => setMode('edit')}>Sửa hồ sơ</button>
      <button className="rounded-lg border bg-white p-3" onClick={() => setMode('add')}>Thêm khách thuê</button>
      <button className="rounded-lg border bg-white p-3" onClick={() => { setTenant({ ...baseTenant, identity_card: '' }); setMode('edit') }}>Hồ sơ cũ thiếu CCCD</button>
      <button className="rounded-lg border bg-white p-3" onClick={() => setListView(true)}>Danh sách khách thuê</button>
      <label>Trạng thái đọc <select aria-label="Trạng thái đọc" className="ml-2 rounded border bg-white p-2" value={scenario} onChange={event => setScenario(event.target.value)}><option value="success">Thành công</option><option value="slow">Đọc chậm 4 giây</option><option value="conflict">Hai số CCCD khác nhau</option><option value="failure">Ảnh không đọc được</option></select></label>
    </div><pre role="status" className="mt-6 whitespace-pre-wrap break-all text-sm">{saved}</pre></main>
    {mode && <TenantFormModal key={mode} initialTenant={mode === 'edit' ? tenant : undefined} onClose={() => setMode(null)} onSubmit={save} isPending={pending} />}
    </>}
  </div></QueryClientProvider>
}
