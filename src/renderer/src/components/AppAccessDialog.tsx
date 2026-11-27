import { useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Coins, Home, Lock, Plus, X } from 'lucide-react'
import type { AppUser } from '../lib/db'
import type { AppKey } from '../lib/app-access'

const APPS: Array<{ id: AppKey; title: string; short: string; subtitle: string }> = [
  { id: 'property', title: 'Nhà trọ AN KHANG HOME', short: 'Nhà trọ', subtitle: 'Phòng, hóa đơn, cho thuê, tài chính, báo cáo' },
  { id: 'dby-finance', title: 'DBY Finance', short: 'DBY Finance', subtitle: 'Ví đầu tư chung: vàng, chứng khoán, tiết kiệm' }
]

// Compact chips for the accounts table: granted apps filled, missing DBY as a dashed "+".
export function AppAccessChips({ user, apps, onEdit }: { user: AppUser; apps: AppKey[] | undefined; onEdit?: () => void }): ReactElement {
  const isAdmin = user.role === 'admin'
  const granted = isAdmin ? APPS.map(app => app.id) : apps ?? ['property']
  return (
    <div className="flex flex-col items-start gap-1">
      {APPS.map(app => {
        const has = granted.includes(app.id)
        const Icon = app.id === 'property' ? Home : Coins
        if (has) return (
          <span key={app.id} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${app.id === 'property' ? 'border border-[#cfe9db] bg-[#f1faf5] text-[#0f5132]' : 'bg-[#084632] text-white'}`}>
            <Icon size={11} />{app.short}{isAdmin && <Lock size={10} className="opacity-70" aria-label="Quản trị viên luôn có quyền" />}
          </span>
        )
        return onEdit ? (
          <button key={app.id} type="button" onClick={event => { event.stopPropagation(); onEdit() }}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-dashed border-slate-300 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-500 transition hover:border-[#0f5132] hover:text-[#0f5132]">
            <Plus size={11} />{app.short}
          </button>
        ) : null
      })}
    </div>
  )
}

type Props = {
  user: AppUser
  apps: AppKey[] | undefined
  saving: boolean
  error?: string
  onClose: () => void
  onSave: (apps: AppKey[]) => void
}

export function AppAccessDialog({ user, apps, saving, error, onClose, onSave }: Props): ReactElement {
  const isAdmin = user.role === 'admin'
  const [selected, setSelected] = useState<AppKey[]>(isAdmin ? APPS.map(app => app.id) : apps ?? ['property'])
  const toggle = (id: AppKey) => setSelected(current => current.includes(id) ? current.filter(app => app !== id) : [...current, id])
  const initials = user.full_name.trim().split(/\s+/).map(part => part[0]).filter(Boolean).slice(0, 1).concat(user.full_name.trim().split(/\s+/).slice(-1).map(part => part[0])).join('').toUpperCase()
  const changed = !isAdmin && (APPS.some(app => selected.includes(app.id) !== (apps ?? ['property']).includes(app.id)))

  return createPortal(
    <div className="fixed inset-0 z-[4500] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={`Phân quyền ứng dụng cho ${user.full_name}`} onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <div className="w-full max-w-[560px] overflow-hidden rounded-[24px] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
          <div className="min-w-0">
            <h2 className="text-xl font-black text-[#10233f]">Phân quyền ứng dụng</h2>
            <div className="mt-3 flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff] text-sm font-black text-[#2864b7]">{initials}</div>
              <div className="min-w-0 text-sm">
                <div className="truncate font-black text-[#10233f]">{user.full_name}</div>
                <div className="truncate text-xs text-slate-500">{user.email || `@${user.username}`} · <span className={isAdmin ? 'font-bold text-[#9a5b00]' : 'font-bold text-[#2864b7]'}>{isAdmin ? 'Quản trị viên' : 'Người dùng'}</span></div>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 disabled:opacity-50" aria-label="Đóng"><X size={18} /></button>
        </div>

        <div className="space-y-3 px-6 pb-5">
          {APPS.map(app => {
            const on = selected.includes(app.id)
            const Icon = app.id === 'property' ? Home : Coins
            return (
              <label key={app.id} className={`flex items-center gap-4 rounded-2xl border p-4 transition ${on ? 'border-[#cfe9db] bg-[#f7fcf9]' : 'border-slate-200 bg-white'} ${isAdmin ? 'cursor-default' : 'cursor-pointer hover:border-[#9fd3b8]'}`}>
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${app.id === 'property' ? 'bg-[#e3f6ec] text-[#0f7a4a]' : 'bg-[#084632] text-[#bff0d4]'}`}><Icon size={22} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-black text-[#10233f]">{app.title}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{app.subtitle}</span>
                  {app.id === 'dby-finance' && on && !isAdmin && (
                    <span className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#b26a00]"><AlertTriangle size={13} className="shrink-0" />Người này sẽ xem và giao dịch được trên ví đầu tư chung</span>
                  )}
                </span>
                <input type="checkbox" role="switch" className="peer sr-only" checked={on} disabled={isAdmin || saving} onChange={() => toggle(app.id)} aria-label={app.title} />
                <span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full transition peer-focus-visible:ring-4 peer-focus-visible:ring-emerald-100 ${on ? 'bg-[#16a34a]' : 'bg-slate-300'} ${isAdmin ? 'opacity-60' : ''}`}>
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-6' : 'left-1'}`} />
                </span>
              </label>
            )
          })}
          {isAdmin && <p className="flex items-center gap-1.5 text-xs text-slate-500"><Lock size={12} />Quản trị viên luôn có quyền dùng mọi ứng dụng.</p>}
          {!isAdmin && selected.length === 0 && <p className="text-xs font-semibold text-rose-600">Tài khoản sẽ không mở được ứng dụng nào sau khi lưu.</p>}
          {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="h-11 rounded-xl bg-slate-100 px-6 text-sm font-bold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50">{isAdmin ? 'Đóng' : 'Hủy'}</button>
          {!isAdmin && <button type="button" onClick={() => onSave(selected)} disabled={saving || !changed} className="h-11 rounded-xl bg-[#0f5132] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#0b4029] disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu quyền'}</button>}
        </div>
      </div>
    </div>,
    document.body
  )
}
