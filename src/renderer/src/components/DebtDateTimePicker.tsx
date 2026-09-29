import { memo, useLayoutEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const pad = (n: number): string => String(n).padStart(2, '0')
export const formatLocalDateTime = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

export const calendarDays = (month: Date): Date[] => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = 1 - (first.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), start + i))
}

// Time steppers wrap within the selected day: changing minutes never changes the date.
export const stepTime = (value: string, part: 'hours' | 'minutes', delta: number): string => {
  const d = new Date(value)
  if (part === 'hours') d.setHours((d.getHours() + delta + 24) % 24)
  else d.setMinutes((d.getMinutes() + delta + 60) % 60)
  return formatLocalDateTime(d)
}

export const DebtDateTimePicker = memo(function DebtDateTimePicker({ value, onChange }: {
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const selected = new Date(value)
  const valid = !Number.isNaN(selected.getTime())
  const date = valid ? selected : new Date()
  const [month, setMonth] = useState(() => new Date(date.getFullYear(), date.getMonth(), 1))
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }) }

  // Position before paint so the calendar never flashes at the viewport origin.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(300, window.innerWidth - 24)
      const height = popup.current?.offsetHeight || 330
      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: Math.max(12, rect.bottom + height + 8 <= window.innerHeight
          ? rect.bottom + 6 : rect.top - height - 6), width
      })
    }
    place()
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  const positioned = position !== null
  useLayoutEffect(() => {
    if (!open || !positioned) return
    // Focus only after the measured position is committed; never scroll the modal.
    popup.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true })
  }, [open, positioned])

  const pick = (day: Date) => {
    const next = new Date(day)
    next.setHours(date.getHours(), date.getMinutes(), 0, 0)
    onChange(formatLocalDateTime(next))
    close()
  }
  const shortcut = (yesterday: boolean) => {
    const next = new Date()
    if (yesterday) {
      next.setDate(next.getDate() - 1)
      next.setHours(date.getHours(), date.getMinutes(), 0, 0)
    }
    onChange(formatLocalDateTime(next))
    close()
  }
  const buttonStyle = 'rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-600'

  return <div ref={root} className="mb-4" onKeyDown={(e) => {
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close() }
  }}>
    <label id={`${id}-label`} className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
      Thời gian giao dịch <span className="text-rose-500">*</span>
    </label>
    <div className="flex flex-wrap items-center gap-2">
      <button ref={trigger} type="button" aria-label="Chọn ngày giao dịch" aria-expanded={open}
        aria-controls={`${id}-calendar`} aria-haspopup="dialog"
        onClick={() => {
          setMonth(new Date(date.getFullYear(), date.getMonth(), 1))
          setPosition(null)
          setOpen(!open)
        }}
        className={`flex h-11 min-w-[160px] flex-1 items-center justify-between gap-3 rounded-xl border px-3 text-[13px] font-bold text-[#17345f] focus-visible:outline-2 focus-visible:outline-emerald-600 ${open ? 'border-sky-400 bg-sky-50/40' : 'border-slate-200 bg-slate-50/50 hover:border-emerald-400'}`}>
        <i className="fa-regular fa-calendar text-slate-500" aria-hidden="true" />
        <span>{pad(date.getDate())}/{pad(date.getMonth() + 1)}/{date.getFullYear()}</span>
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} text-[10px] text-slate-400`} aria-hidden="true" />
      </button>
      <div role="group" aria-label="Giờ giao dịch" className="flex h-11 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/50 px-2">
        <i className="fa-regular fa-clock mr-1 text-slate-500" aria-hidden="true" />
        {(['hours', 'minutes'] as const).map((part, index) => <div key={part} className="flex items-center gap-1">
          {index === 1 && <span className="text-slate-400">:</span>}
          <input type="text" inputMode="numeric" maxLength={2} aria-label={part === 'hours' ? 'Giờ' : 'Phút'}
            value={pad(part === 'hours' ? date.getHours() : date.getMinutes())}
            onChange={(e) => {
              if (!/^\d{1,2}$/.test(e.target.value)) return
              const n = Number(e.target.value)
              if (n > (part === 'hours' ? 23 : 59)) return
              const next = new Date(date)
              if (part === 'hours') next.setHours(n); else next.setMinutes(n)
              onChange(formatLocalDateTime(next))
            }}
            onFocus={(e) => e.target.select()}
            className="h-8 w-9 rounded-lg border border-slate-200 bg-white text-center text-[14px] font-bold tabular-nums text-[#17345f] focus:outline-2 focus:outline-emerald-600" />
          <div className="flex flex-col">
            {[1, -1].map(delta => <button key={delta} type="button"
              aria-label={`${delta === 1 ? 'Tăng' : 'Giảm'} ${part === 'hours' ? 'giờ' : 'phút'}`}
              onClick={() => onChange(stepTime(formatLocalDateTime(date), part, delta))}
              className={`${buttonStyle} flex h-5 w-6 items-center justify-center text-[10px]`}>
              <i className={`fa-solid fa-chevron-${delta === 1 ? 'up' : 'down'}`} aria-hidden="true" />
            </button>)}
          </div>
        </div>)}
      </div>
    </div>
    {open && createPortal(<div ref={popup} id={`${id}-calendar`} role="dialog" aria-label="Chọn ngày giao dịch"
      onMouseDown={e => e.stopPropagation()}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close() }
        if (e.key === 'Tab') {
          const buttons = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('button') || [])
          if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons.at(-1)?.focus() }
          else if (!e.shiftKey && document.activeElement === buttons.at(-1)) { e.preventDefault(); buttons[0]?.focus() }
        }
      }}
      style={position ?? { top: 0, left: 0, width: 300, visibility: 'hidden', pointerEvents: 'none' }} className="fixed z-[200] max-h-[calc(100vh-24px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
      <div className="mb-2 flex gap-2">
        <button type="button" onClick={() => shortcut(false)} className={`${buttonStyle} flex-1 border border-slate-200 py-1.5 text-xs font-bold`}>Bây giờ</button>
        <button type="button" onClick={() => shortcut(true)} className={`${buttonStyle} flex-1 border border-slate-200 py-1.5 text-xs font-bold`}>Hôm qua</button>
      </div>
      <div className="mb-1 flex items-center justify-between">
        <button type="button" aria-label="Tháng trước" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className={`${buttonStyle} h-8 w-8`}><i className="fa-solid fa-chevron-left" aria-hidden="true" /></button>
        <span aria-live="polite" className="text-[13px] font-bold text-[#17345f]">Tháng {month.getMonth() + 1}, {month.getFullYear()}</span>
        <button type="button" aria-label="Tháng sau" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className={`${buttonStyle} h-8 w-8`}><i className="fa-solid fa-chevron-right" aria-hidden="true" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs">
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(day => <span key={day} className="py-2 font-semibold text-slate-400">{day}</span>)}
        {calendarDays(month).map(day => {
          const active = day.toDateString() === date.toDateString()
          return <button key={day.toISOString()} type="button" aria-pressed={active}
            aria-label={`${pad(day.getDate())}/${pad(day.getMonth() + 1)}/${day.getFullYear()}`}
            aria-current={day.toDateString() === new Date().toDateString() ? 'date' : undefined}
            onClick={() => pick(day)}
            className={`mx-auto h-8 w-8 rounded-full text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-sky-500 ${active ? 'bg-emerald-600 text-white' : day.getMonth() === month.getMonth() ? 'text-slate-700 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-50'}`}>
            {day.getDate()}
          </button>
        })}
      </div>
    </div>, document.body)}
  </div>
})
