import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'

// In-app replacement for window.confirm. On Windows, Electron's native confirm
// leaves text inputs unable to take keyboard focus afterwards, which broke the
// password step that follows a delete.
type ConfirmOptions = { title: string; message: string; confirmLabel?: string; danger?: boolean }
type Pending = ConfirmOptions & { resolve: (accepted: boolean) => void }

export function useInvestmentConfirm() {
  const [request, setRequest] = useState<Pending | null>(null)
  const pending = useRef<Pending | null>(null)
  useEffect(() => () => { pending.current?.resolve(false); pending.current = null }, [])
  const confirm = (options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    pending.current?.resolve(false)
    const item = { ...options, resolve }
    pending.current = item
    setRequest(item)
  })
  const finish = (accepted: boolean) => {
    const item = pending.current
    pending.current = null
    setRequest(null)
    item?.resolve(accepted)
  }
  return {
    confirm,
    confirmDialog: request ? createPortal(<ConfirmDialog request={request} onFinish={finish} />, document.body) : null
  }
}

function ConfirmDialog({ request, onFinish }: { request: Pending; onFinish: (accepted: boolean) => void }) {
  const confirmButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    confirmButton.current?.focus()
    return () => previous?.focus()
  }, [])
  return (
    <div
      className="investment-confirm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onFinish(false) }}
      onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onFinish(false) } }}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="investment-confirm-title" aria-describedby="investment-confirm-message" className="investment-confirm__card">
        <div className="investment-confirm__head">
          <span className={`investment-confirm__icon${request.danger ? ' is-danger' : ''}`}><AlertTriangle size={20} /></span>
          <h2 id="investment-confirm-title">{request.title}</h2>
          <button type="button" aria-label="Đóng" className="investment-confirm__close" onClick={() => onFinish(false)}><X size={18} /></button>
        </div>
        <p id="investment-confirm-message" className="investment-confirm__message">{request.message}</p>
        <div className="investment-confirm__actions">
          <button type="button" className="investment-confirm__btn" onClick={() => onFinish(false)}>Hủy</button>
          <button ref={confirmButton} type="button" className={`investment-confirm__btn is-primary${request.danger ? ' is-danger' : ''}`} onClick={() => onFinish(true)}>{request.confirmLabel || 'Đồng ý'}</button>
        </div>
      </div>
    </div>
  )
}
