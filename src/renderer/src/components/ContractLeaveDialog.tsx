import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { FilePenLine, X } from 'lucide-react'

export function ContractLeaveDialog({ onCancel, onLeave }: { onCancel: () => void; onLeave: () => void }) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCancelRef.current(); return }
      if (event.key !== 'Tab') return
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button')
      if (!buttons?.length) return
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); if (previousFocus?.isConnected) previousFocus.focus() }
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[var(--brand-shell)]/30 p-5 backdrop-blur-[3px]" onClick={event => { if (event.target === event.currentTarget) onCancel() }}>
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="relative w-full max-w-[440px] overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-white shadow-2xl">
        <button type="button" aria-label="Đóng xác nhận, tiếp tục chỉnh sửa" onClick={onCancel} className="absolute right-4 top-4 rounded-lg p-1.5 text-[var(--brand-muted)] transition hover:bg-[var(--brand-mint)] focus-visible:outline-2 focus-visible:outline-primary"><X size={18} /></button>
        <div className="px-6 pb-6 pt-7">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-mint)] text-primary"><FilePenLine size={24} strokeWidth={1.7} /></div>
          <h2 id={titleId} className="pr-5 text-lg font-bold text-[var(--brand-shell)]">Hợp đồng có thay đổi chưa lưu</h2>
          <p id={descriptionId} className="mt-2 text-sm leading-6 text-[var(--brand-muted)]">Nếu rời trang, các thay đổi vừa nhập sẽ bị bỏ. Bạn có thể tiếp tục chỉnh sửa và lưu bản nháp trước khi rời.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--brand-border)] bg-[var(--brand-canvas)] px-6 py-4">
          <button type="button" onClick={onLeave} className="rounded-xl border border-[var(--brand-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--brand-muted)] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-primary">Rời trang</button>
          <button ref={cancelRef} type="button" onClick={onCancel} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Tiếp tục chỉnh sửa</button>
        </div>
      </div>
    </div>, document.body
  )
}
