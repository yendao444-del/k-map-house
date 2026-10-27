import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LockKeyhole, RefreshCw, WifiOff } from 'lucide-react'
import { onPwaChange, hasPwaUpdate } from '../platform/pwa'
export function PwaStatus(): React.JSX.Element | null {
  const [offline, setOffline] = useState(!navigator.onLine)
  const [update, setUpdate] = useState(hasPwaUpdate())
  useEffect(() => {
    const sync = () => { setOffline(!navigator.onLine); setUpdate(hasPwaUpdate()) }
    const unsubscribe = onPwaChange(sync)
    sync()
    return unsubscribe
  }, [])

  return <PwaUpdateStatus offline={offline} update={update} installUpdate={() => window.api.update.installLatest()} />
}

// Shared presentation for production and the DEV-only visual fixture.
export function PwaUpdateStatus({ offline, update, installUpdate }: {
  offline: boolean
  update: boolean
  installUpdate: Window['api']['update']['installLatest']
}): React.JSX.Element | null {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const gateRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!update) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const siblings = new Map<HTMLElement, boolean>()
    const lockSiblings = () => {
      for (const element of document.body.children) {
        if (!(element instanceof HTMLElement) || element === gateRef.current || siblings.has(element)) continue
        siblings.set(element, element.inert)
        element.inert = true
      }
    }
    lockSiblings()
    // Include any existing/new app portals, not just the React root.
    const observer = new MutationObserver(lockSiblings)
    observer.observe(document.body, { childList: true })
    triggerRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === 'Tab' || event.key === 'Escape') {
        event.preventDefault()
        triggerRef.current?.focus()
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        triggerRef.current?.click()
      }
      // Background dialogs have global shortcuts; keep them from handling
      // keystrokes while the mandatory update is the only active control.
      event.stopImmediatePropagation()
    }
    const keepFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !gateRef.current?.contains(event.target)) triggerRef.current?.focus()
    }
    document.addEventListener('keydown', trapFocus, true)
    document.addEventListener('focusin', keepFocus, true)
    return () => {
      document.body.style.overflow = previousOverflow
      observer.disconnect()
      for (const [element, wasInert] of siblings) element.inert = wasInert
      document.removeEventListener('keydown', trapFocus, true)
      document.removeEventListener('focusin', keepFocus, true)
      if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus()
    }
  }, [update])

  if (!offline && !update) return null

  const applyUpdate = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await installUpdate()
      setBusy(false)
      if (!result.success) {
        setError(result.error || 'Không thể cập nhật lúc này. Hãy thử lại.')
      }
    } catch {
      setBusy(false)
      setError('Không thể cập nhật lúc này. Hãy thử lại.')
    }
  }

  return <>
    {offline && <div className="pwa-status" role="status">
      <WifiOff size={14} aria-hidden="true" />
      <span>Đang mất mạng. Không thể xác nhận hoặc lưu thay đổi; hãy kết nối lại để tiếp tục.</span>
    </div>}
    {update && createPortal(<div ref={gateRef} className="pwa-update-gate" role="dialog" aria-modal="true" aria-labelledby="pwa-update-lock-title" aria-describedby="pwa-update-lock-description">
      <div className="pwa-update-trigger-wrap" role="status" aria-live="assertive">
        <button
          ref={triggerRef}
          className="pwa-update-trigger"
          type="button"
          onClick={() => { void applyUpdate() }}
          disabled={busy}
          title="Cập nhật phiên bản mới để tiếp tục sử dụng"
          aria-label="Cập nhật phiên bản mới để tiếp tục sử dụng"
        >
          <RefreshCw size={14} aria-hidden="true" className={busy ? 'pwa-update-spin' : ''} />
          <span className="pwa-update-label-full">{busy ? 'Đang cập nhật…' : 'Cập nhật phiên bản mới'}</span>
          <span className="pwa-update-label-compact">{busy ? 'Đang cập nhật…' : 'Cập nhật'}</span>
        </button>
        <span className="pwa-update-required-badge">Bản cập nhật bắt buộc</span>
      </div>
      <div className="pwa-update-lock">
        <div className="pwa-update-lock-content">
          <div className="pwa-update-lock-icon"><LockKeyhole size={32} aria-hidden="true" /></div>
          <h2 id="pwa-update-lock-title">Vui lòng cập nhật phiên bản mới</h2>
          <p id="pwa-update-lock-description">Bạn cần cập nhật phiên bản mới để tiếp tục sử dụng hệ thống An Khang Home.</p>
          {error && <p className="pwa-update-error" role="alert">{error}</p>}
        </div>
      </div>
    </div>, document.body)}
  </>
}
