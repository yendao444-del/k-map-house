import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './cashflow-note.css'

/** Keep notes readable outside the ledger's scrolling and clipped containers. */
export function CashFlowNoteRow({
  as: Tag = 'div', note, className, children
}: {
  as?: 'div' | 'tr'
  note?: string
  className?: string
  children: ReactNode
}) {
  const content = note?.trim() || 'Chưa có ghi chú cho khoản tiền này.'
  const id = useId()
  const popup = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [anchor, setAnchor] = useState<{ x: number; top: number; bottom: number } | null>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const cancelClose = () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const close = () => { cancelClose(); setAnchor(null) }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setAnchor(null), 150)
  }

  useEffect(() => () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
  }, [])

  useEffect(() => { setAnchor(null) }, [note])

  useEffect(() => {
    if (!anchor) return
    const dismiss = () => setAnchor(null)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss() }
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !popup.current?.contains(event.target)) dismiss()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', dismiss)
    window.addEventListener('blur', dismiss)
    document.addEventListener('pointerdown', dismiss)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('blur', dismiss)
      document.removeEventListener('pointerdown', dismiss)
    }
  }, [anchor])

  useLayoutEffect(() => {
    if (!anchor || !popup.current) return
    const { width, height } = popup.current.getBoundingClientRect()
    const margin = 8
    const below = anchor.bottom + margin
    setPosition({
      left: Math.max(margin, Math.min(anchor.x, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(
        below + height <= window.innerHeight - margin ? below : anchor.top - height - margin,
        window.innerHeight - height - margin
      ))
    })
  }, [anchor, content])

  return <>
    <Tag
      className={className ? `${className} cashflow-note-row` : 'cashflow-note-row'}
      tabIndex={0}
      aria-describedby={anchor ? id : undefined}
      onPointerMove={event => {
        if (event.pointerType === 'touch') return
        if ((event.target as Element).closest('button, a, input, select, textarea')) { close(); return }
        cancelClose()
        if (anchor) return
        const rect = event.currentTarget.getBoundingClientRect()
        setAnchor({ x: event.clientX, top: rect.top, bottom: rect.bottom })
      }}
      onPointerLeave={scheduleClose}
      onFocus={event => {
        if (event.target !== event.currentTarget) return
        cancelClose()
        const rect = event.currentTarget.getBoundingClientRect()
        setAnchor({ x: rect.left + 12, top: rect.top, bottom: rect.bottom })
      }}
      onBlur={close}
      onClickCapture={close}
    >{children}</Tag>
    {anchor && createPortal(
      <div ref={popup} id={id} role="tooltip" className="cashflow-note-tooltip"
        style={{ left: position.left, top: position.top }}
        onPointerEnter={cancelClose} onPointerLeave={scheduleClose}>
        <strong>Ghi chú</strong>
        <div>{content}</div>
      </div>, document.body
    )}
  </>
}
