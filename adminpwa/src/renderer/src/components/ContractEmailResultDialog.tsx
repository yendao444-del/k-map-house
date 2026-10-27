import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'
import type { ContractEmailResult } from '../lib/contract-email-delivery'

export function ContractEmailResultDialog({ result, onClose }: { result: ContractEmailResult; onClose: () => void }) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const success = result.outcome === 'success'
  const failed = result.outcome === 'failed'
  const tone = success ? 'bg-emerald-50 text-emerald-700' : failed ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    buttonRef.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button')
      if (!buttons?.length) return
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); if (previousFocus?.isConnected) previousFocus.focus() }
  }, [])

  return createPortal(<div className="fixed inset-0 z-[500] flex items-center justify-center bg-[var(--brand-shell)]/30 p-5 backdrop-blur-[3px]">
    <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="relative w-full max-w-[460px] rounded-2xl border border-[var(--brand-border)] bg-white p-6 shadow-2xl">
      <button type="button" aria-label="Đóng thông báo gửi Gmail" onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-[var(--brand-muted)] hover:bg-[var(--brand-mint)] focus-visible:outline-2 focus-visible:outline-primary"><X size={18} /></button>
      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>{success ? <CheckCircle2 size={26} /> : <AlertCircle size={26} />}</div>
      <h2 id={titleId} className="pr-5 text-lg font-bold text-[var(--brand-shell)]">{result.title}</h2>
      <p id={descriptionId} className="mt-3 break-words text-sm leading-6 text-[var(--brand-ink)]">{result.message}</p>
      <div className="mt-6 flex justify-end"><button ref={buttonRef} type="button" onClick={onClose} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Đã hiểu</button></div>
    </div>
  </div>, document.body)
}
