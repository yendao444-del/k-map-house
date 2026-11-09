import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Mail, ShieldAlert, Smartphone, X } from 'lucide-react'
import { confirmBeneficiaryChange, startBeneficiaryChange, type Beneficiary } from '../lib/mfa'

type Pending = { current: Beneficiary; next: Beneficiary; resolve: (saved: Beneficiary) => void; reject: (error: Error) => void }

// The payment beneficiary is applied ONLY by the server after a fresh
// Authenticator code and a code sent to the admin's login Gmail.
export function useBeneficiaryChange() {
  const [request, setRequest] = useState<Pending | null>(null)
  const pending = useRef<Pending | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      pending.current?.reject(new Error('Đã hủy thao tác.'))
      pending.current = null
    }
  }, [])
  const requireBeneficiaryChange = (current: Beneficiary, next: Beneficiary): Promise<Beneficiary> => {
    if (!mounted.current || pending.current) return Promise.reject(new Error('Hãy hoàn tất xác nhận đang mở.'))
    return new Promise((resolve, reject) => {
      const item = { current, next, resolve, reject }
      pending.current = item
      setRequest(item)
    })
  }
  const finish = (item: Pending, saved: Beneficiary | null) => {
    if (!mounted.current || pending.current !== item) return
    pending.current = null
    setRequest(null)
    if (saved) item.resolve(saved)
    else item.reject(new Error('Đã hủy đổi tài khoản nhận tiền.'))
  }
  return {
    requireBeneficiaryChange,
    beneficiaryDialog: request ? createPortal(
      <BeneficiaryChangeDialog current={request.current} next={request.next} onFinish={saved => finish(request, saved)} />,
      document.body
    ) : null
  }
}

const accountLine = (value: Beneficiary) => `${value.bank_id || '—'} · ${value.account_no || '—'} · ${value.account_name || '—'}`

function BeneficiaryChangeDialog({ current, next, onFinish }: { current: Beneficiary; next: Beneficiary; onFinish: (saved: Beneficiary | null) => void }) {
  const [stage, setStage] = useState<{ step: 'totp' } | { step: 'email'; challengeId: string; maskedEmail: string }>({ step: 'totp' })
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { input.current?.focus() }, [stage.step])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (lock.current || !/^\d{6}$/.test(code)) return
    lock.current = true
    setBusy(true)
    setError('')
    const submitted = code
    setCode('')
    try {
      if (stage.step === 'totp') {
        const started = await startBeneficiaryChange(next, submitted)
        if (alive.current) setStage({ step: 'email', ...started })
      } else {
        const saved = await confirmBeneficiaryChange(stage.challengeId, submitted)
        if (alive.current) onFinish(saved)
      }
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : 'Chưa xác minh được.')
    } finally {
      lock.current = false
      if (alive.current) setBusy(false)
    }
  }
  const emailStep = stage.step === 'email'
  return <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); if (!lock.current) onFinish(null) }
  }}>
    <form role="dialog" aria-modal="true" aria-labelledby="beneficiary-change-title" onSubmit={submit} className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-rose-50/60 px-5 py-4 sm:px-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600"><ShieldAlert size={24} /></div>
        <div className="min-w-0 flex-1"><h2 id="beneficiary-change-title" className="text-lg font-bold text-slate-800">Đổi tài khoản nhận tiền</h2><p className="mt-1 text-sm text-slate-500">Bước {emailStep ? 2 : 1}/2 · Cần cả Google Authenticator và mã gửi qua Gmail.</p></div>
        <button type="button" aria-label="Đóng" disabled={busy} onClick={() => onFinish(null)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X size={20} /></button>
      </div>
      <div className="px-5 py-6 sm:px-8">
        <div className="mb-5 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <p><span className="text-slate-500">Hiện tại:</span> <b className="text-slate-800">{accountLine(current)}</b></p>
          <p><span className="text-slate-500">Đổi thành:</span> <b className="text-rose-700">{accountLine(next)}</b></p>
          <p className="text-xs text-slate-500">Mọi QR trên hóa đơn sẽ chuyển tiền vào tài khoản mới. Tất cả quản trị viên sẽ nhận email cảnh báo.</p>
        </div>
        <div className="mb-3 flex items-start gap-3">
          {emailStep ? <Mail size={26} className="shrink-0 text-rose-600" /> : <Smartphone size={26} className="shrink-0 text-rose-600" />}
          <div><h3 className="font-bold text-slate-800">{emailStep ? 'Mã xác nhận qua Gmail' : 'Mã Google Authenticator'}</h3>
            <p className="mt-1 text-sm text-slate-500">{emailStep ? `Nhập mã 6 số vừa gửi tới ${stage.maskedEmail}. Kiểm tra lại tài khoản MỚI ghi trong email trước khi nhập.` : 'Nhập mã 6 số đang hiển thị trong ứng dụng Authenticator.'}</p></div>
        </div>
        <input ref={input} inputMode="numeric" autoComplete="one-time-code" maxLength={6} disabled={busy} value={code} aria-label={emailStep ? 'Mã Gmail' : 'Mã Authenticator'}
          onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          className="h-12 w-full rounded-xl border border-rose-200 bg-slate-50 px-3 text-center font-mono text-xl tracking-[0.5em] outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200" />
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      </div>
      <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 px-5 py-4 sm:px-8">
        <button type="button" disabled={busy} onClick={() => onFinish(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 disabled:opacity-50">Hủy</button>
        <button type="submit" disabled={busy || code.length !== 6} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Đang xác minh…' : emailStep ? 'Xác nhận đổi tài khoản' : 'Tiếp tục'}</button>
      </div>
    </form>
  </div>
}
