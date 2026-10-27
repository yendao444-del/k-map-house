import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Mail, ShieldCheck, Smartphone } from 'lucide-react'
import { downloadRecoveryCodes } from '../lib/recovery-download'
import {
  acknowledgeRecoveryCodes, authorizeSecuritySession, beginSecurityRecovery,
  consumeSecurityRecoveryCode, issueRecoveryBundle, resetMfaAfterRecovery,
  sendSecurityEmailCode, startTotpEnrollment, verifySecurityEmailCode,
  verifyTotpEnrollment, securityState
} from '../lib/mfa'
import './account-profile.css'

type Setup = Awaited<ReturnType<typeof startTotpEnrollment>>
type Bundle = Awaited<ReturnType<typeof issueRecoveryBundle>>

// The same ordered workflow is used during sign-in and inside the profile.
// Business access is granted only after the server acknowledges saved codes.
export function SecurityAccessPanel({ initialState, onComplete, onCancel, onPendingChange, loginHint = '' }: {
  initialState: string
  onComplete: () => Promise<void>
  onCancel?: () => Promise<void>
  onPendingChange?: (pending: boolean) => void
  loginHint?: string
}) {
  const [stage, setStage] = useState(initialState)
  const [recoveryAcknowledged, setRecoveryAcknowledged] = useState<boolean | null>(null)
  const [checkingStatus, setCheckingStatus] = useState(initialState === 'email')
  const [statusError, setStatusError] = useState('')
  const [statusRetry, setStatusRetry] = useState(0)
  const [setup, setSetup] = useState<Setup | null>(null)
  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [email, setEmail] = useState<{ challengeId: string; maskedEmail?: string } | null>(null)
  const [code, setCode] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [error, setError] = useState('')
  const [login, setLogin] = useState(loginHint)
  const [password, setPassword] = useState('')
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [downloadNotice, setDownloadNotice] = useState('')
  const waitingForCodes = stage === 'recovery_codes'

  // Recovery codes belong to the account, not this phone/browser. A returning
  // account may need device email verification without repeating setup.
  useEffect(() => {
    if (initialState !== 'email') return
    let active = true
    setCheckingStatus(true); setStatusError('')
    void securityState().then(state => {
      if (typeof state.recovery_acknowledged !== 'boolean') throw new Error('Chưa kiểm tra được trạng thái mã khôi phục. Vui lòng thử lại.')
      if (active) setRecoveryAcknowledged(state.recovery_acknowledged)
    }).catch(caught => {
      if (active) setStatusError(caught instanceof Error ? caught.message : 'Không thể tải trạng thái bảo mật.')
    }).finally(() => { if (active) setCheckingStatus(false) })
    return () => { active = false }
  }, [initialState, statusRetry])

  const readNextSecurityState = async (): Promise<string> => {
    const state = await securityState()
    if (typeof state.recovery_acknowledged === 'boolean') setRecoveryAcknowledged(state.recovery_acknowledged)
    return String(state.state)
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  // Keep the once-visible bundle mounted until explicit acknowledgement.
  useEffect(() => {
    onPendingChange?.(busy || waitingForCodes || Boolean(setup))
    return () => onPendingChange?.(false)
  }, [busy, waitingForCodes, setup, onPendingChange])

  const run = async (action: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await action() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Chưa thể hoàn tất xác minh. Vui lòng thử lại.') }
    finally { lock.current = false; setBusy(false) }
  }
  const sendEmail = async () => {
    // Reserve the retry window before the request starts. Failed provider or
    // rate-limit responses must not cause an immediate second request.
    const retryAt = Date.now() + 60_000
    setResendAt(retryAt)
    try {
      const challenge = await sendSecurityEmailCode(stage === 'recovery_email' ? 'recovery' : 'signin')
      setEmail(challenge); setCode(''); setResendAt(retryAt)
    } catch (caught) {
      setResendAt(retryAt)
      throw caught
    }
  }
  const finish = async () => { await authorizeSecuritySession(); await onComplete() }
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    void run(async () => {
      if (stage === 'recover_password') {
        await beginSecurityRecovery(login, password)
        setPassword(''); setCode(''); setEmail(null); setStage('recovery_email')
      } else if (stage === 'recovery') {
        await resetMfaAfterRecovery(); setStage('enroll')
      } else if (stage === 'enroll') {
        if (!setup) { setSetup(await startTotpEnrollment()); return }
        if (!/^\d{6}$/.test(code)) throw new Error('Nhập mã 6 số từ Google Authenticator.')
        await verifyTotpEnrollment(setup.factorId, setup.challengeId, code)
        setSetup(null); setCode(''); setEmail(null)
        const next = await readNextSecurityState()
        if (next === 'authorize' || next === 'ready') await finish()
        else setStage(next)
      } else if (stage === 'email' || stage === 'recovery_email') {
        if (!email) { await sendEmail(); return }
        if (!/^\d{6}$/.test(code)) throw new Error('Nhập mã 6 số đã gửi tới email của bạn.')
        await verifySecurityEmailCode(stage === 'recovery_email' ? 'recovery' : 'signin', email.challengeId, code)
        setCode(''); setEmail(null)
        if (stage === 'recovery_email') { setStage('recovery_code'); return }
        const state = await readNextSecurityState()
        if (state === 'authorize' || state === 'ready') await finish()
        else setStage(state)
      } else if (stage === 'recovery_code') {
        await consumeSecurityRecoveryCode(code)
        setCode(''); setStage('recovery')
        await resetMfaAfterRecovery(); setStage('enroll')
      } else if (stage === 'recovery_codes') {
        if (!bundle) { setBundle(await issueRecoveryBundle()); return }
        if (!saved) throw new Error('Hãy lưu mã khôi phục trước khi tiếp tục.')
        await acknowledgeRecoveryCodes(bundle.batchId)
        await finish()
        setBundle(null); setCode('')
      } else await finish()
    })
  }
  const otpStage = stage === 'email' || stage === 'recovery_email' || (stage === 'enroll' && Boolean(setup))
  const emailStage = stage === 'email' || stage === 'recovery_email'
  const intro = stage === 'enroll' && !setup
  const setupFlow = stage === 'enroll' || stage === 'recovery_codes' || (stage === 'email' && recoveryAcknowledged === false)
  const activeStep = stage === 'recovery_codes' ? 2 : emailStage ? 1 : 0
  const title = intro ? 'Thiết lập xác minh 2 bước' : stage === 'enroll' ? 'Kết nối Google Authenticator' : stage === 'recovery_codes' ? 'Lưu mã khôi phục' : emailStage ? 'Xác minh email tài khoản' : 'Khôi phục thiết bị xác thực'
  return <form className={`account-mfa-wizard${intro ? ' account-mfa-intro' : ''}`} onSubmit={submit} aria-busy={busy}>
    <header className="account-mfa-brand"><span><ShieldCheck size={28} aria-hidden="true" />AN KHANG <b>HOME</b></span><span className="account-status">{stage === 'enroll' || stage === 'recovery_codes' ? 'Thiết lập bắt buộc' : 'Xác minh tài khoản'}</span></header>
    <div className="account-mfa-heading"><h2>{title}</h2><p>{intro ? 'Bạn cần thiết lập Google Authenticator để tiếp tục sử dụng hệ thống.' : stage === 'recovery_codes' ? 'Lưu các mã bên dưới để đăng nhập khi mất điện thoại.' : stage === 'enroll' ? 'Mở Google Authenticator, chọn dấu + và quét mã QR bên dưới.' : emailStage ? 'Xác minh email để bảo vệ tài khoản trên thiết bị này.' : 'Xác minh thông tin để thiết lập lại Google Authenticator.'}</p></div>
    {setupFlow && <ol className="account-setup-steps" aria-label="Các bước thiết lập bảo mật">{[
      [Smartphone, <>Cài Google<br />Authenticator</>], [Mail, 'Xác minh email'], [FileText, 'Lưu mã khôi phục']
    ].map(([Icon, label], index) => {
      const StepIcon = Icon as typeof Smartphone
      return <li key={index} className={index <= activeStep ? 'is-active' : ''} aria-current={index === activeStep ? 'step' : undefined}><span className="account-step-icon"><StepIcon size={26} aria-hidden="true" /></span><span className="account-step-number">{index + 1}</span><span className="account-step-label">{label as React.ReactNode}</span></li>
    })}</ol>}
    <div className="account-mfa-body">
    {checkingStatus && <p role="status">Đang kiểm tra trạng thái bảo mật…</p>}
    {stage === 'email' && recoveryAcknowledged === true && <p role="status">Google Authenticator và mã khôi phục đã được thiết lập. Bạn chỉ cần xác minh email trên thiết bị này để tiếp tục.</p>}
    {statusError && <><div className="account-alert" role="alert">{statusError}</div><button type="button" className="account-secondary" disabled={checkingStatus || busy} onClick={() => setStatusRetry(value => value + 1)}>Thử lại kiểm tra bảo mật</button></>}
    {stage === 'enroll' && <>
      {intro ? <div className="account-setup-required">Bạn phải hoàn tất thiết lập trước khi truy cập các chức năng quản lý.</div> : <div className="account-qr-layout"><img className="account-mfa-qr" src={setup!.qrCode} alt="Mã QR thiết lập Google Authenticator" /><div><h3>Quét mã bằng điện thoại</h3><p>Cài ứng dụng Google Authenticator từ Google Play hoặc App Store. Không chia sẻ mã QR hoặc khóa thiết lập.</p><details><summary>Không quét được mã QR?</summary><code className="account-mfa-secret">{setup!.secret}</code></details></div></div>}
    </>}
    {emailStage && <p>{email ? `Mã xác minh đã gửi tới ${email.maskedEmail || 'email đã xác nhận của tài khoản'}. Mã có hiệu lực trong 5 phút.` : 'Xác minh email đã xác nhận của tài khoản để hoàn tất bảo mật trên thiết bị này.'}</p>}
    {stage === 'recover_password' && <>
      <p>Cần xác minh lại mật khẩu, email và một mã khôi phục đã lưu. Sau đó bạn phải thiết lập Google Authenticator mới.</p>
      <label className="account-field">Email hoặc tên đăng nhập<input className="account-input" required autoComplete="username" value={login} onChange={event => setLogin(event.target.value)} disabled={busy} /></label>
      <label className="account-field">Mật khẩu hiện tại<input className="account-input" type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /></label>
    </>}
    {stage === 'recovery_code' && <><p>Nhập một mã khôi phục chưa sử dụng. Mã này chỉ cho phép thiết lập lại MFA.</p><input className="account-input" required autoComplete="off" spellCheck={false} value={code} onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-F0-9-]/g, ''))} maxLength={35} aria-label="Mã khôi phục" placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX" disabled={busy} /></>}
    {stage === 'recovery' && <p>Thông tin khôi phục đã được xác minh. Tiếp tục để đặt lại thiết bị xác thực và tạo mã khôi phục mới.</p>}
    {otpStage && (!emailStage || email) && <input className="account-input" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} placeholder="Mã 6 số" aria-label={emailStage ? 'Mã xác minh email' : 'Mã Google Authenticator'} disabled={busy} />}
    {stage === 'recovery_codes' && <>
      <p>Mã khôi phục chỉ hiển thị một lần. Lưu ở nơi an toàn để dùng khi mất điện thoại. Mỗi mã chỉ dùng được một lần.</p>
      {bundle && <><div className="account-recovery-grid">{bundle.codes.map(value => <code key={value}>{value}</code>)}</div><button className="account-download" type="button" disabled={busy} onClick={() => {
        setError(''); setDownloadNotice('')
        try { downloadRecoveryCodes(bundle.codes); setDownloadNotice('Đã yêu cầu tải file .txt. Hãy kiểm tra file và lưu ở nơi an toàn trước khi xác nhận.') }
        catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải mã khôi phục. Bạn có thể lưu lại các mã trên màn hình.') }
      }}><Download size={18} aria-hidden="true" />Tải mã khôi phục (.txt)</button>{downloadNotice && <p className="account-download-notice" role="status">{downloadNotice}</p>}<label className="account-recovery-check"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} disabled={busy} /> Tôi đã lưu các mã khôi phục ở nơi an toàn.</label></>}
    </>}
    {error && <div className="account-alert" role="alert">{error}</div>}
    {emailStage && email && <button className="account-secondary" type="button" disabled={busy || now < resendAt} onClick={() => void run(sendEmail)}>{now < resendAt ? `Gửi lại sau ${Math.ceil((resendAt - now) / 1000)} giây` : 'Gửi lại mã email'}</button>}
    </div>
    <footer className="account-mfa-footer">{onCancel && <button type="button" className="account-text-button" disabled={busy} onClick={() => void run(onCancel)}>Đăng xuất</button>}
    <button className="account-primary" type="submit" disabled={busy || checkingStatus || Boolean(statusError) || Boolean(bundle && !saved) || Boolean(emailStage && now < resendAt && !email)}>{busy ? 'Đang xử lý…' : emailStage && now < resendAt && !email ? `Gửi lại sau ${Math.ceil((resendAt - now) / 1000)} giây` : stage === 'enroll' ? setup ? 'Xác minh Google Authenticator' : 'Bắt đầu thiết lập' : emailStage ? email ? 'Xác minh email' : 'Gửi mã xác minh email' : stage === 'recovery_codes' ? bundle ? 'Đã lưu, hoàn tất' : 'Hiển thị mã khôi phục' : stage === 'recover_password' ? 'Xác minh mật khẩu' : stage === 'recovery_code' ? 'Khôi phục thiết bị xác thực' : 'Tiếp tục'}</button></footer>
  </form>
}

