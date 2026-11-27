import { useEffect, useRef, useState, type ReactElement } from 'react'
import dbyFinanceLogo from '../assets/dby_finance_logo.png'
// Forest-green tile with mint coin stacks; same mark in the title bar and the menu.
import type { Workspace } from './workspace'

type Props = {
  homeLogo: string
  canUseDbyFinance: boolean
  // False when the account may only open DBY Finance.
  canUseHome?: boolean
  isDbyWorkspace: boolean
  // Return false to keep the current workspace (e.g. unsaved contract page).
  onSelect: (next: Workspace) => void
}

const ITEMS = (homeLogo: string, dbyLogo: string) => [
  { id: 'home' as const, logo: homeLogo, title: 'AN KHANG HOME', subtitle: 'Quản lý phòng trọ' },
  { id: 'dby' as const, logo: dbyLogo, title: 'DBY Finance', subtitle: 'Ví đầu tư chung' }
]

// The brand block in the title bar. With access to both apps it doubles as the
// workspace switcher; otherwise it is a static logo of the one allowed app.
export function WorkspaceSwitcher({ homeLogo, canUseDbyFinance: canUseDby, canUseHome = true, isDbyWorkspace, onSelect }: Props): ReactElement {
  const canUseDbyFinance = canUseDby && canUseHome
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        disabled={!canUseDbyFinance}
        aria-haspopup={canUseDbyFinance ? 'menu' : undefined}
        aria-expanded={canUseDbyFinance ? open : undefined}
        onClick={() => setOpen((value) => !value)}
        title={canUseDbyFinance ? 'Chuyển không gian' : undefined}
        className="group flex items-center space-x-2 rounded-xl py-1 pl-1 pr-2 text-left transition-colors enabled:hover:bg-black/5 disabled:cursor-default"
      >
        <div className={`investment-titlebar-logo flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg shadow-sm transition-transform group-enabled:group-hover:scale-105 ${isDbyWorkspace ? 'is-dby' : 'border border-[#e5eee8] bg-white p-1'}`}>
          <img src={isDbyWorkspace ? dbyFinanceLogo : homeLogo} alt={isDbyWorkspace ? 'DBY Finance' : 'AN KHANG HOME'} className="h-full w-full object-contain" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="investment-titlebar-brand text-sm font-bold tracking-tight text-[#15231d]">{isDbyWorkspace ? 'DBY Finance' : 'AN KHANG HOME'}</span>
          <span className="investment-titlebar-subtitle text-[9px] font-medium uppercase tracking-wider text-[#718079]">
            {isDbyWorkspace ? 'Ví đầu tư chung' : 'Quản lý phòng trọ'}
          </span>
        </div>
        {canUseDbyFinance && <svg aria-hidden="true" viewBox="0 0 24 24" className="investment-titlebar-subtitle ml-1 h-3 w-3 text-[#718079]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>}
      </button>
      {canUseDbyFinance && open && (
        <div role="menu" className="investment-titlebar-menu absolute left-0 top-[calc(100%+6px)] z-[120] w-64 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl">
          <p className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Chuyển không gian</p>
          {ITEMS(homeLogo, dbyFinanceLogo).map((item) => {
            const active = (item.id === 'dby') === isDbyWorkspace
            return (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setOpen(false)
                  onSelect(item.id)
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 ${active ? 'bg-slate-50' : ''}`}
              >
                <img src={item.logo} alt="" className={`h-8 w-8 shrink-0 rounded-lg object-contain ${item.id === 'home' ? 'border border-slate-200 bg-white p-0.5' : ''}`} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-sm font-bold text-slate-700">{item.title}</span>
                  <span className="block text-[11px] text-slate-400">{item.subtitle}</span>
                </span>
                {active && <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#1f5c3c]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
