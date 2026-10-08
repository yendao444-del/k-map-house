import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, LoaderCircle, FileCheck2 } from 'lucide-react'
type ContractView = { html: string; room: string; name: string; email: string; status: string; expiresAt: string; requirePassword: boolean; amendment?: { reason: string } }
export default function ContractConfirmation() {
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') || '')
  const [visitId] = useState(() => crypto.randomUUID())
  const documentViewSent = useRef(false)
  const [contract, setContract] = useState<ContractView | null>(null)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [accepted, setAccepted] = useState(false), [done, setDone] = useState(false)
  const [password, setPassword] = useState(''), [repeat, setRepeat] = useState('')
  async function call(action: string, values: Record<string, unknown> = {}) {
    const response = await fetch('/api/contract-confirmation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ action, token, ...values }) })
    const data = await response.json()
    if (!response.ok || !data.ok) throw new Error(data.error || 'Chưa xử lý được yêu cầu.')
    return data
  }
  useEffect(() => {
    document.title = 'AN KHANG HOME · Xác nhận hợp đồng'
    let active = true
    if (!/^[a-f0-9]{64}$/.test(token)) { setError('Link xác nhận không hợp lệ. Vui lòng liên hệ chủ nhà.'); setLoading(false); return }
    call('view', { visitId }).then(data => { if (active) setContract(data.contract) }).catch(cause => { if (active) setError(cause.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token, visitId])
  function recordDocumentView() {
    if (!contract || documentViewSent.current) return
    documentViewSent.current = true
    // Telemetry must not block viewing/confirming the contract during an outage.
    void call('document_viewed', { visitId }).catch(() => { documentViewSent.current = false })
  }
  async function confirm() {
    if (!accepted || busy || !contract) return
    setBusy(true); setError('')
    try { const result = await call('confirm', { accepted: true }); setContract({ ...contract, status: 'confirmed', requirePassword: result.requirePassword }); if (!result.requirePassword) setDone(true) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Chưa xác nhận được.') }
    finally { setBusy(false) }
  }
  async function activate(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (password !== repeat) { setError('Mật khẩu nhập lại chưa khớp.'); return }
    setBusy(true); setError('')
    try { await call('activate', { password }); setPassword(''); setRepeat(''); setDone(true); history.replaceState(null, '', location.pathname) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Chưa cấp được tài khoản.') }
    finally { setBusy(false) }
  }
  return <div className="tenant-app contract-confirmation-page">
    <header className="brand-header"><img src="/assets/brand-white.png" width="232" height="78" alt="AN KHANG HOME" /></header>
    <main className="contract-confirmation-content">
      {import.meta.env.VITE_CONTRACT_TEST === '1' && <p className="contract-test-banner">MÔI TRƯỜNG TEST · Dữ liệu phòng giả lập</p>}
      {loading ? <p role="status"><LoaderCircle className="reading-spinner" />Đang tải hợp đồng…</p> : done || contract?.status === 'confirmed' && !contract.requirePassword ? <section className="contract-success"><CheckCircle2 size={44} /><h1>Đã xác nhận hợp đồng</h1><p>Tài khoản của bạn đã sẵn sàng.</p><a className="primary-button" href="/">Đăng nhập website</a></section> : contract?.requirePassword ? <form className="contract-password" onSubmit={activate}>
        <h1>Đặt mật khẩu tài khoản</h1><p>Hợp đồng đã xác nhận. Email đăng nhập: <strong>{contract.email}</strong></p>
        <label htmlFor="contract-password">Mật khẩu mới</label><input id="contract-password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
        <label htmlFor="contract-password-repeat">Nhập lại mật khẩu</label><input id="contract-password-repeat" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={repeat} onChange={e => setRepeat(e.target.value)} disabled={busy} />
        <p className="auth-footnote">Từ 10 ký tự. Chủ nhà không xem hoặc gửi mật khẩu của bạn.</p><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Đang cấp tài khoản…' : 'Hoàn tất và cấp tài khoản'}</button>
      </form> : contract && <>
        <div className="contract-intro"><FileCheck2 /><div><h1>Xác nhận {contract.amendment ? 'bản sửa ' : ''}hợp đồng · Phòng {contract.room}</h1><p>{contract.name} · Kiểm tra đầy đủ nội dung bên dưới</p>{contract.amendment && <p>Bản hiện tại vẫn có hiệu lực đến khi bạn xác nhận bản sửa.</p>}</div></div>
        <iframe title="Toàn bộ hợp đồng thuê nhà" className="contract-document" onLoad={recordDocumentView} sandbox="" referrerPolicy="no-referrer" srcDoc={`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px;overflow-wrap:anywhere}*{box-sizing:border-box}ul{list-style-type:disc;padding-left:24px}h2{font-size:15px}</style></head><body>${contract.html}</body></html>`} />
        <div className="contract-confirm-actions"><label><input type="checkbox" checked={accepted} disabled={busy} onChange={e => setAccepted(e.target.checked)} />Tôi đã đọc và đồng ý với thông tin, điều khoản hợp đồng.</label><button className="primary-button" disabled={!accepted || busy} onClick={() => void confirm()}>{busy ? 'Đang xác nhận…' : 'Xác nhận hợp đồng'}</button></div>
      </>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </main>
  </div>
}
