import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eye, EyeOff, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { confirmSensitivePassword, hasRecentPasswordConfirmation } from '../lib/mfa'

type PendingConfirmation = { title: string; resolve: () => void; reject: (error: Error) => void }

export function usePasswordConfirmation() {
  const [request, setRequest] = useState<PendingConfirmation | null>(null)
  const pending = useRef<PendingConfirmation | null>(null)
  const mounted = useRef(true)
  const checking = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      pending.current?.reject(new Error('Đã hủy thao tác.'))
      pending.current = null
    }
  }, [])
  const requirePassword = async (title: string): Promise<void> => {
    if (!mounted.current || pending.current || checking.current) throw new Error('Hãy hoàn tất xác nhận đang mở.')
    checking.current = true
    let recent: boolean
    try { recent = await hasRecentPasswordConfirmation() }
    finally { checking.current = false }
    if (!mounted.current) throw new Error('Đã hủy thao tác.')
    if (recent) return
    return new Promise((resolve, reject) => {
      const item = { title, resolve, reject }
      pending.current = item
      setRequest(item)
    })
  }
  const finish = (item: PendingConfirmation, accepted: boolean) => {
    if (!mounted.current || pending.current !== item) return
    pending.current = null
    setRequest(null)
    if (accepted) item.resolve()
    else item.reject(new Error('Đã hủy thao tác.'))
  }
  return {
    requirePassword,
    passwordConfirmation: request ? createPortal(
      <PasswordConfirmationDialog key={request.title} title={request.title} onFinish={accepted => finish(request, accepted)} />,
      document.body
    ) : null
  }
}

function PasswordConfirmationDialog({ title, onFinish }: { title: string; onFinish: (accepted: boolean) => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const lock = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    const previousFocus = document.activeElement as HTMLElement | null
    form.current?.querySelector<HTMLInputElement>('input')?.focus()
    return () => { alive.current = false; previousFocus?.focus() }
  }, [])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (lock.current || !password) return
    lock.current = true
    setBusy(true)
    setError('')
    const submittedPassword = password
    setPassword('')
    try {
      await confirmSensitivePassword(submittedPassword)
      if (alive.current) onFinish(true)
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : 'Chưa xác nhận được mật khẩu.')
    } finally {
      lock.current = false
      if (alive.current) setBusy(false)
    }
  }
  return <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); if (!lock.current) onFinish(false) }
    if (event.key === 'Tab') {
      const fields = form.current?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)')
      if (!fields?.length) { event.preventDefault(); return }
      const first = fields[0], last = fields[fields.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  }}>
    <form ref={form} role="dialog" aria-modal="true" aria-labelledby="password-confirmation-title" onSubmit={submit} className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-blue-50/50 px-5 py-4 sm:px-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600"><RefreshCw size={24} /></div>
        <div className="min-w-0 flex-1"><h2 id="password-confirmation-title" className="text-lg font-bold text-slate-800">{title.includes('SePay') ? 'Đồng bộ lịch sử SePay' : 'Xác nhận thao tác'}</h2><p className="mt-1 text-sm text-slate-500">{title}</p></div>
        <button type="button" aria-label="Đóng xác nhận" disabled={busy} onClick={() => { setPassword(''); onFinish(false) }} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X size={20} /></button>
      </div>
      <div className="px-5 py-6 sm:px-8">
        <div className="mb-5 flex items-start gap-3"><ShieldCheck size={28} className="shrink-0 text-blue-600" /><div><h3 className="font-bold text-slate-800">Xác nhận bằng mật khẩu</h3><p className="mt-2 text-sm text-slate-500">Nhập mật khẩu hiện tại để xác nhận thao tác này.</p></div></div>
        <label htmlFor="sensitive-current-password" className="mb-2 block text-sm font-semibold text-slate-700">Mật khẩu hiện tại</label>
        <div className="relative"><input id="sensitive-current-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={256} disabled={busy} value={password} onChange={event => setPassword(event.target.value)} className="h-12 w-full rounded-xl border border-blue-200 bg-slate-50 pl-3 pr-12 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /><button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} disabled={busy} onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-0 px-3 text-slate-500">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>
        <p className="mt-3 text-xs leading-5 text-slate-500">Bạn vẫn giữ nguyên phiên đăng nhập đã xác minh hai bước.</p>
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      </div>
      <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 px-5 py-4 sm:px-8">
        <button type="button" disabled={busy} onClick={() => { setPassword(''); onFinish(false) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 disabled:opacity-50">Hủy</button>
        <button type="submit" disabled={busy || !password} className="rounded-xl bg-[#00558d] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Đang xác nhận…' : 'Xác nhận và tiếp tục'}</button>
      </div>
    </form>
  </div>
}
