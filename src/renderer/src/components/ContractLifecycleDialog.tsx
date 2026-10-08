import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { AlertCircle, LoaderCircle, X } from 'lucide-react'
import { getContracts, getRooms, getTenants, type Contract, type Room } from '../lib/db'
import type { ContractDraft } from '../lib/contract-draft'
import { checkContractCancellation, cancelContractWithReason, sendContractCancellationNotice, startContractAmendment, type CancellationKind } from '../lib/contract-confirmation'

export function ContractLifecycleDialog({ contract, room, mode, onClose, onAmendment, onCancelled }: { contract: Contract; room: Room; mode: 'edit' | 'cancel'; onClose: () => void; onAmendment?: (draft: ContractDraft) => void; onCancelled?: () => void }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [kind, setKind] = useState<CancellationKind>('wrong_room')
  const [referenceId, setReferenceId] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState(contract.status === 'cancelled')
  const [noticeText, setNoticeText] = useState('')
  const dialog = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose); closeRef.current = onClose
  const busyRef = useRef(false)
  const check = useQuery({ queryKey: ['contract-cancellation-check', contract.id], queryFn: () => checkContractCancellation(contract.id), enabled: mode === 'cancel', retry: false, staleTime: 0 })
  useEffect(() => { if (mode === 'cancel' && check.data?.isTestContract) { setKind('test_reset'); setReferenceId(''); setReason(value => value || 'Kết thúc thử nghiệm luồng hợp đồng và tài khoản.') } }, [mode, check.data?.isTestContract])
  const tenants = useQuery({ queryKey: ['tenants'], queryFn: getTenants, enabled: mode === 'cancel' })
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: getRooms, enabled: mode === 'cancel' })
  const contracts = useQuery({ queryKey: ['contracts'], queryFn: getContracts, enabled: mode === 'cancel' })
  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'edit') return startContractAmendment(contract.id, reason)
      await cancelContractWithReason(contract.id, reason, kind, referenceId)
      return undefined
    },
    onSuccess: async draft => {
      await Promise.all(['rooms', 'room', 'contracts', 'activeContracts', 'contractDrafts', 'tenantWebAccounts', 'tenant-web-accounts', 'contract-confirmation-status', 'contract-confirmation-history', 'contract-history'].map(key => queryClient.invalidateQueries({ queryKey: [key] })))
      if (draft) { onAmendment?.(draft); onClose() }
      else {
        setCompleted(true)
        onCancelled?.()
        if (kind === 'test_reset') setNoticeText('Đã hủy hợp đồng thử nghiệm. Không gửi email thông báo.')
        else {
          try { setNoticeText(await sendContractCancellationNotice(contract.id)) }
          catch (cause) { setNoticeText(cause instanceof Error ? cause.message : 'Đã hủy hợp đồng nhưng chưa gửi được email thông báo.') }
        }
        await check.refetch()
      }
    },
    onError: cause => { setError(cause instanceof Error ? cause.message : 'Không xử lý được hợp đồng.'); if (mode === 'cancel') void check.refetch() }
  })
  const retryNotice = useMutation({ mutationFn: () => sendContractCancellationNotice(contract.id), onSuccess: text => { setNoticeText(text); void check.refetch(); void queryClient.invalidateQueries({ queryKey: ['contract-history'] }) }, onError: cause => setNoticeText(cause instanceof Error ? cause.message : 'Chưa gửi được thông báo.') })
  busyRef.current = mutation.isPending || retryNotice.isPending
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLElement>('button')?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) { event.preventDefault(); closeRef.current() }
      if (event.key !== 'Tab') return
      const fields = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled),input:not(:disabled),select:not(:disabled)')
      if (!fields?.length) return
      const first = fields[0], last = fields[fields.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus() }
  }, [])
  return createPortal(<div className="fixed inset-0 z-[440] flex items-center justify-center bg-[var(--brand-shell)]/40 p-5 backdrop-blur-sm" onClick={event => { if (event.target === event.currentTarget && !busyRef.current) onClose() }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="contract-lifecycle-title" className="flex max-h-[90vh] w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-white shadow-2xl">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--brand-border)] p-5"><div><h2 id="contract-lifecycle-title" className="text-lg font-bold text-[var(--brand-shell)]">{mode === 'edit' ? 'Sửa hợp đồng' : kind === 'test_reset' ? 'Hủy hợp đồng thử nghiệm' : 'Hủy hợp đồng do lập nhầm'}</h2><p className="mt-1 text-sm text-[var(--brand-muted)]">{room.name} · {contract.tenant_name}</p></div><button type="button" aria-label="Đóng" disabled={mutation.isPending || retryNotice.isPending} onClick={onClose} className="rounded-lg p-1.5 text-[var(--brand-muted)] hover:bg-[var(--brand-mint)]"><X size={18} /></button></header>
      {completed && mode === 'cancel' ? <div className="space-y-4 p-5"><p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Hợp đồng đã hủy; lịch sử được giữ lại và link cũ đã thu hồi. Khách không cần xác nhận.</p><p role="status" className="text-sm leading-6">{mutation.isPending || retryNotice.isPending ? 'Đang gửi thông báo Gmail…' : noticeText || (check.data?.notice?.status === 'sent' ? `Đã gửi email tới ${check.data.notice.recipient}.` : check.data?.notice ? `Email: ${check.data.notice.recipient} · ${check.data.notice.status === 'failed' ? 'Gửi thất bại' : check.data.notice.status === 'pending' ? 'Chờ gửi' : 'Chưa xác định kết quả gửi; kiểm tra Gmail đã gửi.'}` : 'Không có thông báo hủy được lưu cho hợp đồng cũ này.')}</p>{kind !== 'test_reset' && check.data?.notice?.error && <p className="text-xs text-rose-700">{check.data.notice.error}</p>}<div className="flex justify-end gap-2">{kind !== 'test_reset' && ['pending','failed'].includes(check.data?.notice?.status || '') && <button type="button" disabled={busyRef.current} onClick={() => retryNotice.mutate()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Gửi lại thông báo</button>}<button type="button" disabled={busyRef.current} onClick={onClose} className="rounded-lg border px-4 py-2.5 text-sm">Đóng</button></div></div> : <form className="flex min-h-0 flex-1 flex-col" onSubmit={event => { event.preventDefault(); if (!mutation.isPending && reason.trim().length >= 5 && (mode === 'edit' || acknowledged && check.data?.allowed && (kind === 'test_reset' || referenceId))) mutation.mutate() }}>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {mode === 'edit' ? <p className="rounded-xl bg-[var(--brand-mint)] p-3 text-sm leading-6 text-[var(--brand-shell)]">Tạo bản sửa để khách xem các thay đổi và xác nhận qua email. Bản hiện tại vẫn có hiệu lực trong lúc chờ. Nếu đã có bản sửa đang chờ, mở lại bản đó.</p> : <>
          <ul className="list-disc space-y-1 rounded-xl bg-amber-50 p-4 pl-8 text-sm leading-6 text-amber-900"><li>{check.data?.isTestContract ? 'Chỉ hợp đồng này được backend đánh dấu thử nghiệm; có thể hủy test sau 24 giờ.' : 'Chỉ hủy do lập nhầm trong 24 giờ từ lần khách xác nhận đầu tiên.'}</li><li>Backend chặn nếu đã có tiền, hóa đơn, bàn giao hoặc sử dụng điện nước.</li><li>Hợp đồng, lý do và lịch sử vẫn được giữ; khách chỉ nhận email thông báo sau khi hủy.</li></ul>
          {check.isPending ? <p role="status" className="flex gap-2 text-sm text-[var(--brand-muted)]"><LoaderCircle size={18} className="animate-spin" />Đang kiểm tra dữ liệu liên quan…</p> : check.isError ? <div role="alert" className="text-sm text-rose-700">{check.error.message}<button type="button" onClick={() => void check.refetch()} className="ml-2 underline">Thử lại</button></div> : <p className={`rounded-lg p-3 text-sm leading-5 ${check.data?.allowed ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{check.data?.reason}{!check.data?.allowed && <span className="mt-2 block text-xs">Hóa đơn: {check.data?.invoices || 0} · Phiếu vào phòng: {check.data?.receipts || 0} · Giao dịch: {check.data?.cashTransactions || 0}</span>}</p>}
        </>}
        {mode === 'cancel' && <div className="space-y-3"><div><label htmlFor="contract-cancellation-kind" className="mb-2 block text-xs font-semibold text-[var(--brand-shell)]">Lý do đối chiếu *</label><select id="contract-cancellation-kind" required value={kind} disabled={mutation.isPending || check.data?.isTestContract === true} onChange={event => { setKind(event.target.value as CancellationKind); setReferenceId(event.target.value === 'wrong_email' ? contract.tenant_id || '' : '') }} className="w-full rounded-xl border border-[var(--brand-border)] p-3 text-sm"><option value="wrong_room">Chọn nhầm phòng</option><option value="wrong_tenant">Chọn nhầm khách</option><option value="wrong_email">Nhập nhầm email nhận hợp đồng</option><option value="duplicate">Lập trùng hợp đồng</option>{check.data?.isTestContract && <option value="test_reset">Đang kiểm thử hệ thống</option>}</select></div>{kind !== 'test_reset' && <div><label htmlFor="contract-cancellation-reference" className="mb-2 block text-xs font-semibold text-[var(--brand-shell)]">{kind === 'wrong_email' ? 'Email đúng trong hồ sơ khách thuê *' : 'Hồ sơ đúng / hợp đồng giữ lại *'}</label><select id="contract-cancellation-reference" required value={referenceId} disabled={mutation.isPending} onChange={event => setReferenceId(event.target.value)} className="w-full rounded-xl border border-[var(--brand-border)] p-3 text-sm"><option value="">Chọn hồ sơ</option>{kind === 'wrong_room' && rooms.data?.filter(item => item.id !== contract.room_id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}{kind === 'wrong_tenant' && tenants.data?.filter(item => item.id !== contract.tenant_id && item.is_active).map(item => <option key={item.id} value={item.id}>{item.full_name} · {item.email || 'chưa có email'}</option>)}{kind === 'wrong_email' && tenants.data?.filter(item => item.id === contract.tenant_id).map(item => <option key={item.id} value={item.id}>{item.email || 'Cần bổ sung email đúng trong hồ sơ trước'}</option>)}{kind === 'duplicate' && contracts.data?.filter(item => item.id !== contract.id && item.status === 'active' && item.room_id === contract.room_id && item.tenant_id === contract.tenant_id).map(item => <option key={item.id} value={item.id}>…{item.id.slice(-8)}</option>)}</select></div>}</div>}
        {mode === 'edit' || kind !== 'test_reset' ? <div><label htmlFor="contract-lifecycle-reason" className="mb-2 block text-xs font-semibold text-[var(--brand-shell)]">Lý do chi tiết {mode === 'edit' ? 'sửa' : 'hủy'} *</label><textarea id="contract-lifecycle-reason" rows={3} minLength={5} maxLength={1000} required disabled={mutation.isPending} value={reason} onChange={event => { setReason(event.target.value); setError('') }} placeholder={mode === 'edit' ? 'Ví dụ: Nhập nhầm tiền cọc khi lập hợp đồng' : 'Nêu vì sao hồ sơ này được lập nhầm'} className="w-full rounded-xl border border-[var(--brand-border)] p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /></div> : <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-800">Hợp đồng này được đánh dấu để kiểm thử hệ thống. Không cần nhập lý do bổ sung.</p>}
        {mode === 'cancel' && <label className="flex items-start gap-2 text-xs leading-5 text-[var(--brand-ink)]"><input type="checkbox" className="mt-1" checked={acknowledged} disabled={mutation.isPending} onChange={event => setAcknowledged(event.target.checked)} />Tôi xác nhận đây là hợp đồng {kind === 'test_reset' ? 'thử nghiệm' : 'lập nhầm'} và đã kiểm tra các ảnh hưởng trên.</label>}
        {error && <p role="alert" className="flex items-start gap-2 text-sm text-rose-700"><AlertCircle size={16} className="shrink-0" />{error}</p>}
        </div><div className="flex shrink-0 justify-end gap-2 border-t border-[var(--brand-border)] p-5"><button type="button" disabled={mutation.isPending || retryNotice.isPending} onClick={onClose} className="rounded-lg border border-[var(--brand-border)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-muted)]">Quay lại</button><button type="submit" disabled={mutation.isPending || (kind !== 'test_reset' && reason.trim().length < 5) || mode === 'cancel' && (!acknowledged || !check.data?.allowed || check.isFetching || kind !== 'test_reset' && !referenceId)} className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 ${mode === 'edit' ? 'bg-primary' : 'bg-rose-600'}`}>{mutation.isPending && <LoaderCircle size={16} className="animate-spin" />}{mutation.isPending ? 'Đang xử lý…' : mode === 'edit' ? 'Mở bản sửa' : kind === 'test_reset' ? 'Hủy hợp đồng kiểm thử' : 'Hủy và gửi thông báo'}</button></div>
      </form>}
    </section>
  </div>, document.body)
}
