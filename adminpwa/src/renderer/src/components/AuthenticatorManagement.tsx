import { useEffect, useRef, useState } from 'react'
import { Download, ShieldCheck } from 'lucide-react'
import {
  acknowledgeRecoveryCodes, authorizeSecuritySession, beginTotpChallenge,
  cancelTotpReplacement, issueRecoveryBundle, listTotpFactors, prepareTotpReplacement,
  retainProfileSecurityFlow, startTotpReplacementEnrollment, verifyTotpChallenge, securityState
} from '../lib/mfa'
import { downloadRecoveryCodes } from '../lib/recovery-download'

type Setup = Awaited<ReturnType<typeof startTotpReplacementEnrollment>>
type Bundle = Awaited<ReturnType<typeof issueRecoveryBundle>>
type Action = 'replace' | 'codes' | null
export function AuthenticatorManagement({ disabled, onPendingChange, onComplete, onRecovery }: {
  disabled: boolean; onPendingChange: (pending: boolean) => void
  onComplete: (message: string) => Promise<void>; onRecovery: () => void
}) {
  const [action, setAction] = useState<Action>(null)
  const [stage, setStage] = useState<'current' | 'new' | 'codes'>('current')
  const [challenge, setChallenge] = useState<{ factorId: string; challengeId: string } | null>(null)
  const [setup, setSetup] = useState<Setup | null>(null)
  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [code, setCode] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const lock = useRef(false)
  const oldVerified = useRef(false)
  const newVerified = useRef(false)
  useEffect(() => { onPendingChange(Boolean(action) || busy); return () => onPendingChange(false) }, [action, busy, onPendingChange])
  useEffect(() => { if (action) return retainProfileSecurityFlow(); return undefined }, [action])
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await fn() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Chưa hoàn tất thao tác. Hãy thử lại.') }
    finally { lock.current = false; setBusy(false) }
  }
  const start = (next: Exclude<Action, null>) => void run(async () => {
    const factor = (await listTotpFactors()).find(item => item.status === 'verified')
    if (!factor) throw new Error('Chưa tìm thấy Authenticator đang hoạt động.')
    const challengeId = await beginTotpChallenge(factor.id)
    oldVerified.current = false; newVerified.current = false
    setChallenge({ factorId: factor.id, challengeId }); setCode(''); setNotice(''); setStage('current'); setAction(next)
  })
  const submit = () => void run(async () => {
    if (stage !== 'codes' && !/^\d{6}$/.test(code)) throw new Error('Nhập mã Google Authenticator gồm 6 số.')
    if (stage === 'current' && challenge) {
      await verifyTotpChallenge(challenge.factorId, challenge.challengeId, code); oldVerified.current = true
      if (action === 'replace') {
        await prepareTotpReplacement(challenge.factorId)
        setSetup(await startTotpReplacementEnrollment()); setStage('new')
      } else { setStage('codes'); setBundle(await issueRecoveryBundle()) }
      setCode('')
    } else if (stage === 'new' && setup) {
      if (!newVerified.current) { await verifyTotpChallenge(setup.factorId, setup.challengeId, code); newVerified.current = true }
      setSetup(null); setCode(''); setStage('codes'); setBundle(await issueRecoveryBundle())
    } else if (stage === 'codes') {
      if (!bundle) { setBundle(await issueRecoveryBundle()); return }
      if (!saved) throw new Error('Hãy lưu mã khôi phục trước khi hoàn tất.')
      await acknowledgeRecoveryCodes(bundle.batchId)
      const state = await securityState()
      if (state.state === 'authorize') await authorizeSecuritySession()
      else if (state.state !== 'ready') throw new Error('Cần hoàn tất xác minh bảo mật để tiếp tục.')
      setBundle(null); setSaved(false); setAction(null)
      await onComplete(action === 'replace' ? 'Đã đổi Google Authenticator và cập nhật mã khôi phục.' : 'Đã tạo mã khôi phục mới. Các mã cũ đã hết hiệu lực.')
    }
  })
  const cancel = () => void run(async () => {
    if (action === 'replace' && oldVerified.current) await cancelTotpReplacement()
    setAction(null); setSetup(null); setChallenge(null); setCode(''); setError('')
  })
  return <div className="account-authenticator-management" aria-busy={busy}>
    <div className="account-authenticator-heading"><h3>Google Authenticator</h3><span className="account-status"><ShieldCheck size={15} aria-hidden="true" />Đã bật</span></div>
    {!action && <>
      <p>Tài khoản của bạn đang được bảo vệ bằng xác minh 2 bước.</p>
      <div className="account-authenticator-actions"><button className="account-primary" type="button" disabled={disabled || busy} onClick={() => start('replace')}>Đổi Google Authenticator</button><button className="account-secondary" type="button" disabled={disabled || busy} onClick={() => start('codes')}>Tạo mã khôi phục mới</button></div>
      <p className="account-authenticator-hint">Bạn sẽ xác minh mã hiện tại trước khi thực hiện thay đổi.</p>
      <div className="account-authenticator-recovery"><button className="account-text-button" type="button" disabled={disabled || busy} onClick={onRecovery}>Mất điện thoại?</button><p>Dùng mã khôi phục để thiết lập lại ứng dụng.</p></div>
    </>}
    {action && <form className="account-authenticator-flow" onSubmit={event => { event.preventDefault(); submit() }}>
      <h4>{stage === 'current' ? 'Xác minh Authenticator hiện tại' : stage === 'new' ? 'Kết nối Authenticator mới' : 'Lưu mã khôi phục mới'}</h4>
      <p>{stage === 'current' ? action === 'replace' ? 'Nhập mã trên ứng dụng đang dùng. Thiết bị cũ vẫn hoạt động trong khi bạn thiết lập thiết bị mới.' : 'Nhập mã trên ứng dụng đang dùng. Bộ mã mới sẽ thay thế toàn bộ mã khôi phục cũ.' : stage === 'new' ? 'Mở Google Authenticator trên thiết bị mới, chọn dấu + và quét mã QR. Sau đó nhập mã mới để hoàn tất chuyển đổi.' : 'Mỗi mã chỉ dùng được một lần. Lưu ở nơi an toàn, tách khỏi điện thoại của bạn.'}</p>
      {setup && <div className="account-authenticator-setup"><img src={setup.qrCode.startsWith('data:') ? setup.qrCode : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qrCode)}`} alt="Mã QR kết nối Authenticator mới" /><details><summary>Không quét được mã QR?</summary><p>Nhập khóa thiết lập này vào ứng dụng:</p><code>{setup.secret}</code></details></div>}
      {stage !== 'codes' && <label className="account-field">{stage === 'new' ? 'Mã trên Authenticator mới' : 'Mã Google Authenticator'}<input className="account-input account-otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} disabled={busy} autoFocus required /></label>}
      {bundle && <><div className="account-recovery-grid">{bundle.codes.map(item => <code key={item}>{item}</code>)}</div><button className="account-text-button" type="button" onClick={() => void run(async () => { downloadRecoveryCodes(bundle.codes); setNotice('Đã tải mã khôi phục. Hãy lưu file ở nơi an toàn.') })} disabled={busy}><Download size={16} aria-hidden="true" />Tải mã khôi phục</button><label className="account-check"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} disabled={busy} />Tôi đã lưu mã khôi phục ở nơi an toàn</label></>}
      <div className="account-buttons">{stage !== 'codes' && !newVerified.current && <button className="account-secondary" type="button" disabled={busy} onClick={cancel}>Hủy</button>}<button className="account-primary" type="submit" disabled={busy || (stage === 'codes' && Boolean(bundle) && !saved)}>{busy ? 'Đang xử lý…' : stage === 'current' ? 'Xác minh để tiếp tục' : stage === 'new' ? 'Xác nhận Authenticator mới' : bundle ? 'Hoàn tất' : 'Tạo lại mã khôi phục'}</button></div>
    </form>}
    {error && <div className="account-alert" role="alert">{error}</div>}
    {notice && <div className="account-alert account-success" role="status">{notice}</div>}
  </div>
}

