import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Clock3, X, RefreshCw, LoaderCircle } from 'lucide-react'
import type { ConfirmationEvent } from '../lib/contract-confirmation'
import { contractChanges } from '../../../shared/contract-changes'

const labels: Record<string, string> = {
  created: 'Tạo link xác nhận', sent: 'Gửi Gmail', delivery_failed: 'Gửi Gmail thất bại',
  link_opened: 'Khách mở link', document_viewed: 'Khách xem hợp đồng', confirmed: 'Khách xác nhận hợp đồng',
  account_ready: 'Tài khoản khách thuê sẵn sàng', revoked: 'Link bị thu hồi',
  amendment_created: 'Tạo bản sửa hợp đồng', amendment_applied: 'Áp dụng bản sửa đã xác nhận', cancelled: 'Hủy hợp đồng do lập nhầm',
  cancellation_email_sent: 'Gửi Gmail thông báo hủy', cancellation_email_failed: 'Gmail thông báo hủy thất bại', cancellation_email_uncertain: 'Chưa rõ kết quả gửi Gmail thông báo hủy'
}
const formatDate = (value: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value))

export function ContractConfirmationHistory({ events, loading, error, refreshing, onRefresh, onClose }: { events: ConfirmationEvent[]; loading?: boolean; error?: string; refreshing?: boolean; onRefresh: () => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null), closeButtonRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef(onClose); closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current() }
      if (event.key !== 'Tab') return
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      if (!buttons?.length) return
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handler)
    return () => { document.removeEventListener('keydown', handler); if (previous?.isConnected) previous.focus() }
  }, [])
  const multipleAttempts = events.some(event => (event.attempt || 1) > 1)
  return createPortal(<div className="fixed inset-0 z-[450] flex items-center justify-center bg-[var(--brand-shell)]/30 p-5 backdrop-blur-[2px]" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="contract-history-title" className="w-full max-w-[480px] rounded-2xl border border-[var(--brand-border)] bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-[var(--brand-border)] px-5 py-4"><h2 id="contract-history-title" className="flex items-center gap-2 text-base font-bold text-[var(--brand-shell)]"><Clock3 size={18} className="text-primary" />Lịch sử xác nhận</h2><div className="flex gap-1"><button type="button" aria-label="Làm mới lịch sử" onClick={onRefresh} disabled={refreshing} className="rounded-lg p-1.5 text-[var(--brand-muted)] hover:bg-[var(--brand-mint)] disabled:opacity-40"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /></button><button ref={closeButtonRef} type="button" aria-label="Đóng lịch sử xác nhận" onClick={onClose} className="rounded-lg p-1.5 text-[var(--brand-muted)] hover:bg-[var(--brand-mint)]"><X size={18} /></button></div></header>
      <div className="max-h-[60vh] overflow-y-auto p-5">{loading ? <p role="status" className="flex items-center gap-2 text-sm text-[var(--brand-muted)]"><LoaderCircle size={16} className="animate-spin" />Đang tải lịch sử…</p> : error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : events.length === 0 ? <p className="text-sm text-[var(--brand-muted)]">Chưa có hoạt động nào được ghi nhận.</p> : <ol className="space-y-4">{events.map((event, index) => <li key={event.id} className="relative flex gap-3">{index < events.length - 1 && <span className="absolute left-[7px] top-5 h-full w-px bg-[var(--brand-border)]" />}<span className={`relative mt-1 h-4 w-4 shrink-0 rounded-full border-4 ${event.type === 'delivery_failed' ? 'border-rose-100 bg-rose-500' : 'border-emerald-100 bg-primary'}`} /><div className="min-w-0"><p className="text-sm font-semibold text-[var(--brand-shell)]">{event.type === 'cancelled' && event.reason?.startsWith('Kết thúc hợp đồng thử nghiệm:') ? 'Hủy hợp đồng thử nghiệm' : labels[event.type] || event.type}</p><time dateTime={event.at} className="mt-0.5 block text-xs tabular-nums text-[var(--brand-muted)]">{formatDate(event.at)} · GMT+7</time>{multipleAttempts && event.attempt && <p className="mt-0.5 text-[11px] text-[var(--brand-muted)]">Lượt gửi {event.attempt} · Bản {event.revision}</p>}{event.historical && <p className="mt-0.5 text-[11px] text-[var(--brand-muted)]">Mốc đã lưu trước khi bật lịch sử</p>}{event.actor && <p className="mt-1 text-xs text-[var(--brand-muted)]">Người thao tác: {event.actor}</p>}{event.reason && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-[var(--brand-ink)]">Lý do: {event.reason}</p>}{event.beforeForm && event.afterForm && <dl className="mt-2 space-y-1">{contractChanges(event.beforeForm, event.afterForm).map(change => <div key={change.label} className="text-xs"><dt className="font-semibold">{change.label}</dt><dd className="whitespace-pre-wrap break-words">{change.before} → {change.after}</dd></div>)}</dl>}{event.type === 'sent' && event.email && <p className="mt-0.5 break-all text-xs text-[var(--brand-muted)]">{event.email}</p>}</div></li>)}</ol>}</div>
      <footer className="border-t border-[var(--brand-border)] px-5 py-3 text-[11px] leading-5 text-[var(--brand-muted)]">Cập nhật mỗi 5 giây. “Xem hợp đồng” là nội dung đã hiển thị, chưa chứng minh khách đã đọc toàn bộ.</footer>
    </section>
  </div>, document.body)
}
