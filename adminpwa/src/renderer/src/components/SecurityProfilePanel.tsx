import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, History, LaptopMinimal, LogOut, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react'
import {
  beginTotpChallenge, cancelMfaLogin, isTotpEnrollmentAvailable, listTotpFactors,
  authorizeSecuritySession, revokeSecurityDevice, revokeSecuritySessions, securityOverview, securityState,
  trustSecurityDevice, verifyTotpChallenge, retainProfileSecurityFlow, ownSecurityMethods, sendSecurityEmailCode, verifySecurityEmailCode
} from '../lib/mfa'
import { SecurityAccessPanel } from './SecurityAccessPanel'
import { AuthenticatorManagement } from './AuthenticatorManagement'

type Overview = Awaited<ReturnType<typeof securityOverview>>
const dateLabel = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('vi-VN') : 'Chưa có dữ liệu'
const events: Record<string, string> = {
  mfa_rotation_started: 'Bắt đầu đổi Authenticator', mfa_rotation_cancelled: 'Hủy đổi Authenticator', mfa_rotation_finished: 'Đổi Google Authenticator',
  password_verified: 'Xác minh mật khẩu', mfa_enrollment_started: 'Bắt đầu thiết lập MFA',
  mfa_enrollment_verified: 'Bật Google Authenticator', mfa_disabled: 'Đặt lại thiết bị xác thực',
  mfa_challenge_failed: 'Mã Authenticator không hợp lệ', mfa_challenge_verified: 'Xác minh Authenticator',
  email_sent: 'Gửi email xác minh', email_delivery_failed: 'Email xác minh gửi thất bại',
  email_challenge_failed: 'Mã email không hợp lệ', email_challenge_verified: 'Xác minh email',
  recovery_codes_issued: 'Tạo mã khôi phục', recovery_codes_acknowledged: 'Xác nhận lưu mã khôi phục',
  recovery_code_used: 'Dùng mã khôi phục', recovery_code_failed: 'Khôi phục thất bại',
  trusted_device_created: 'Ghi nhớ thiết bị', trusted_device_revoked: 'Thu hồi thiết bị',
  session_authorized: 'Cấp quyền phiên', session_revoked: 'Thu hồi phiên', sessions_revoked: 'Đăng xuất mọi phiên',
  risk_step_up_required: 'Yêu cầu xác minh thiết bị mới', rate_limited: 'Tạm giới hạn xác minh'
}

type SecurityView = 'security' | 'devices' | 'sessions' | 'activity' | 'authenticator' | 'email' | 'password'
export function SecurityProfilePanel({ isLegacyLocalAdmin, onPendingChange, initialView = 'security', passwordForm, passwordPending = false }: { isLegacyLocalAdmin: boolean; onPendingChange: (pending: boolean) => void; initialView?: 'security' | 'activity'; passwordForm?: ReactNode; passwordPending?: boolean }) {
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(false)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [methods, setMethods] = useState<Awaited<ReturnType<typeof ownSecurityMethods>> | null>(null)
  const [methodsError, setMethodsError] = useState('')
  const [emailChallenge, setEmailChallenge] = useState<Awaited<ReturnType<typeof sendSecurityEmailCode>> | null>(null)
  const [emailCode, setEmailCode] = useState('')
  const [resendAt, setResendAt] = useState(0)
  const [resendSeconds, setResendSeconds] = useState(0)
  const [step, setStep] = useState<string | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)

  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [managementPending, setManagementPending] = useState(false)
  const lock = useRef(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [challenge, setChallenge] = useState<{ factorId: string; challengeId: string } | null>(null)
  const pendingAction = useRef<(() => Promise<void>) | null>(null)
  const [code, setCode] = useState('')
  const [confirmAll, setConfirmAll] = useState(false)
  const [label, setLabel] = useState('Thiết bị của tôi')
  const [view, setView] = useState<SecurityView>(initialView)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => { onPendingChange(busy || Boolean(step) || managementPending); return () => onPendingChange(false) }, [busy, step, managementPending, onPendingChange])
  useEffect(() => {
    if (!resendAt) return
    const tick = () => setResendSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [resendAt])
  useEffect(() => { if (step || busy || challenge) return retainProfileSecurityFlow(); return undefined }, [step, busy, challenge])
  const loadMethods = async () => {
    setMethods(null); setMethodsError('')
    try { setMethods(await ownSecurityMethods()) }
    catch (caught) { setMethodsError(caught instanceof Error ? caught.message : 'Không thể tải trạng thái phương thức xác minh.') }
  }
  const load = async () => {
    setLoadFailed(false); setOverview(null); setEnabled(null)
    try {
      const [factors, readiness, currentState] = await Promise.all([listTotpFactors(), isTotpEnrollmentAvailable(), securityState()])
      setEnabled(factors.some(factor => factor.status === 'verified')); setAvailable(readiness)
      let state = currentState
      // Only complete authorization when the server says all other steps are
      // done. Email/recovery requirements must still go through their wizard.
      if (state.state === 'authorize') { await authorizeSecuritySession(); state = await securityState() }
      if (['email', 'recovery_codes', 'recovery', 'enroll'].includes(String(state.state))) { setStep(String(state.state)); return }
      await loadMethods()
      if (state.state === 'ready') setOverview(await securityOverview())
    } catch (caught) { setLoadFailed(true); throw caught }
  }
  useEffect(() => {
    if (isLegacyLocalAdmin) { setLoading(false); return }
    void load().catch(caught => setError(caught instanceof Error ? caught.message : 'Không thể tải bảo mật tài khoản.')).finally(() => setLoading(false))
  }, [isLegacyLocalAdmin])
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try { await action() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Chưa hoàn tất thao tác bảo mật.') }
    finally { lock.current = false; setBusy(false) }
  }
  const freshChallenge = async () => {
    const factor = (await listTotpFactors()).find(item => item.status === 'verified')
    if (!factor) throw new Error('Chưa có Google Authenticator được xác nhận.')
    setChallenge({ factorId: factor.id, challengeId: await beginTotpChallenge(factor.id) }); setCode('')
  }
  const requestSensitiveAction = async (action: () => Promise<void>) => {
    await freshChallenge()
    pendingAction.current = action
  }
  const sendEmail = async () => {
    if (Date.now() < resendAt) return
    const sent = await sendSecurityEmailCode('signin')
    setEmailChallenge(sent); setEmailCode(''); setResendSeconds(60); setResendAt(Date.now() + 60_000)
    setNotice('Đã gửi mã xác minh vào email đăng nhập. Mã có hiệu lực trong 5 phút.')
  }
  if (isLegacyLocalAdmin) return <div className="account-alert">Tài khoản quản trị cục bộ chưa kết nối Supabase nên chưa thể thiết lập MFA.</div>
  if (loading) return <div className="account-mfa-notice"><p>Đang kiểm tra bảo mật tài khoản…</p></div>
  if (step) return <SecurityAccessPanel key={step} initialState={step} onCancel={cancelMfaLogin} onComplete={async () => { setStep(null); await load() }} />
  const activeDevices = overview?.devices.filter(device => !device.revoked_at && typeof device.expires_at === 'string' && Date.parse(device.expires_at) > Date.now()) || []
  const activeSessions = overview?.sessions.filter(session => !session.revoked_at && typeof session.expires_at === 'string' && Date.parse(session.expires_at) > Date.now()) || []
  const tab = view === 'activity' ? 'activity' : view === 'devices' || view === 'sessions' ? 'devices' : view === 'password' ? 'password' : 'security'
  const interactionBusy = busy || passwordPending || managementPending
  const open = (next: SecurityView) => {
    if (lock.current || passwordPending || managementPending) return
    // Leaving an unsubmitted OTP prompt cancels its intent, never executes it.
    pendingAction.current = null; setChallenge(null); setCode('')
    panelRef.current?.parentElement?.scrollTo({ top: 0 }); setView(next); setConfirmAll(false); setNotice(''); setError('')
  }
  return <div className="account-security-panel" ref={panelRef} aria-busy={busy}>
    <div className="account-tabs account-security-tabs" role="tablist" aria-label="Bảo mật tài khoản">{([['security', 'Bảo mật'], ['devices', 'Thiết bị'], ['activity', 'Hoạt động'], ['password', 'Đổi mật khẩu']] as const).map(([key, text]) => <button key={key} id={`security-tab-${key}`} type="button" role="tab" aria-selected={tab === key} aria-controls="security-tab-panel" tabIndex={tab === key ? 0 : -1} disabled={interactionBusy} onClick={() => open(key)} onKeyDown={event => {
      const tabs = ['security', 'devices', 'activity', 'password'] as const
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const next = event.key === 'Home' ? 'security' : event.key === 'End' ? 'password' : tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
      open(next); document.getElementById(`security-tab-${next}`)?.focus()
    }}>{text}</button>)}</div>
    <div id="security-tab-panel" role="tabpanel" aria-labelledby={`security-tab-${tab}`}>
    {challenge && <form className="account-form" onSubmit={event => { event.preventDefault(); void run(async () => {
      if (!/^\d{6}$/.test(code)) throw new Error('Nhập mã Authenticator gồm 6 số.')
      await verifyTotpChallenge(challenge.factorId, challenge.challengeId, code)
      setChallenge(null); setCode('')
      const action = pendingAction.current; pendingAction.current = null
      if (action) await action()
      else { setNotice('Đã xác minh Google Authenticator thành công.'); await load() }
    }) }}><label className="account-field">Mã Google Authenticator<input className="account-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} disabled={busy} autoFocus required /></label><div className="account-buttons"><button className="account-secondary" type="button" disabled={busy} onClick={() => { pendingAction.current = null; setChallenge(null); setCode(''); setError('') }}>Hủy</button><button className="account-primary" type="submit" disabled={busy}>Xác minh và thực hiện</button></div></form>}
    {error && <div className="account-alert" role="alert">{error}</div>}
    {notice && <div className="account-alert account-success" role="status">{notice}</div>}
    {loadFailed && <button className="account-secondary" type="button" disabled={busy} onClick={() => void run(load)}>Tải lại thông tin bảo mật</button>}
    {view === 'security' && <section className="account-security-methods">
      <div className="account-methods-heading"><h3>Phương thức xác minh</h3><p>Quản lý các phương thức dùng để bảo vệ tài khoản.</p></div>
      {methodsError && <div className="account-alert" role="alert">{methodsError}<button className="account-text-button" type="button" disabled={busy} onClick={() => void run(loadMethods)}>Tải lại trạng thái</button></div>}
      <div className="account-security-rows">
      <div className="account-setting-row"><ShieldCheck className="account-setting-icon" aria-hidden="true" /><div className="account-setting-copy"><h3>Google Authenticator</h3><p>Mã xác minh từ ứng dụng Authenticator.</p></div><span className={`account-status${enabled === null ? ' account-status-neutral' : !enabled ? ' account-status-pending' : ''}`}>{enabled === null ? 'Chưa có dữ liệu' : enabled ? 'Đã bật' : 'Chưa bật'}</span><button className="account-setting-action" type="button" disabled={busy || loadFailed} onClick={() => open('authenticator')}>Quản lý<ChevronRight size={22} aria-hidden="true" /></button></div>
      <div className="account-setting-row"><Mail className="account-setting-icon" aria-hidden="true" /><div className="account-setting-copy"><h3>Gmail</h3><p>Nhận mã xác minh vào email đăng nhập.</p></div><span className={`account-status${!methods ? ' account-status-neutral' : !methods.emailVerified ? ' account-status-pending' : ''}`}>{!methods ? 'Chưa có dữ liệu' : methods.emailVerified ? 'Đã xác minh' : 'Chưa xác minh'}</span><button className="account-setting-action" type="button" disabled={busy || loadFailed || !methods} onClick={() => { open('email'); if (!methods?.emailVerified && !emailChallenge) void run(sendEmail) }}>{methods?.emailVerified ? 'Xem trạng thái' : 'Xác minh'}<ChevronRight size={22} aria-hidden="true" /></button></div>
      <div className="account-setting-row"><Phone className="account-setting-icon" aria-hidden="true" /><div className="account-setting-copy"><h3>Số điện thoại</h3><p>Xác minh SMS chưa được mở trên hệ thống.</p></div><span className="account-status account-status-neutral">Chưa hỗ trợ</span><button className="account-setting-action" type="button" disabled>Thêm số điện thoại<ChevronRight size={22} aria-hidden="true" /></button></div>
      </div>
      <p className="account-methods-note">Authenticator bảo vệ đăng nhập. Email hỗ trợ xác minh thiết bị mới và khôi phục quyền truy cập.</p>
    </section>}
    {view !== 'security' && <section className="account-security-detail">
      {view === 'authenticator' && (enabled ? <AuthenticatorManagement disabled={busy || loadFailed} onPendingChange={setManagementPending} onComplete={async message => { await load(); setNotice(message) }} onRecovery={() => setStep('recover_password')} /> : <><h3>Google Authenticator</h3><p>{available ? 'Thêm mã xác minh từ ứng dụng Google Authenticator để bảo vệ tài khoản.' : 'Chưa thể thiết lập Google Authenticator. Vui lòng thử lại sau.'}</p><button className="account-primary" disabled={busy || !available || loadFailed} type="button" onClick={() => setStep('enroll')}>Bật Google Authenticator</button></>)}
      {view === 'password' && passwordForm && <div className="account-password-panel">{passwordForm}</div>}
      {view === 'email' && <div className="account-email-verification"><button className="account-text-button account-back-button" type="button" disabled={busy} onClick={() => open('security')}>Về phương thức xác minh</button><h3>Xác minh Gmail</h3>{methods?.emailVerified ? <><span className="account-status" role="status">Đã xác minh email đăng nhập</span><p>Trạng thái này được ghi nhận sau khi nhập đúng mã OTP gửi vào email đăng nhập, và hiển thị trong Tài khoản hệ thống.</p></> : <><p>Mã được gửi đến {emailChallenge?.maskedEmail || 'email đăng nhập của bạn'}. Kiểm tra cả thư mục Spam. Mã có hiệu lực trong 5 phút.</p>{emailChallenge && <form className="account-form" onSubmit={event => { event.preventDefault(); void run(async () => {
        if (!/^\d{6}$/.test(emailCode)) throw new Error('Nhập mã email gồm 6 số.')
        try { await verifySecurityEmailCode('signin', emailChallenge.challengeId, emailCode) }
        finally { setEmailCode('') }
        setEmailChallenge(null)
        await queryClient.invalidateQueries({ queryKey: ['users'] })
        await loadMethods()
        setNotice('Đã xác minh email đăng nhập thành công.')
      }) }}><label className="account-field" htmlFor="profile-email-code">Mã xác minh email<input id="profile-email-code" className="account-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus value={emailCode} onChange={event => setEmailCode(event.target.value.replace(/\D/g, ''))} disabled={busy} /></label><button className="account-primary" type="submit" disabled={busy || emailCode.length !== 6}>{busy ? 'Đang xác minh…' : 'Xác minh email'}</button></form>}<button className="account-secondary" type="button" disabled={busy || resendSeconds > 0} onClick={() => void run(sendEmail)}>{resendSeconds > 0 ? `Gửi lại sau ${resendSeconds}s` : emailChallenge ? 'Gửi lại mã' : 'Gửi mã xác minh'}</button>{methodsError && <div className="account-alert" role="alert">{methodsError}<button className="account-text-button" type="button" disabled={busy} onClick={() => void run(loadMethods)}>Tải lại trạng thái</button></div>}</>}</div>}
      {view === 'devices' && overview && <><h3>Thiết bị tin cậy</h3><p>Chỉ ghi nhớ máy cá nhân. Thời hạn tối đa 30 ngày; IP hoặc trình duyệt thay đổi có thể yêu cầu email lại.</p><div className="account-trust-form">
      <label className="account-field">Tên thiết bị<input className="account-input" maxLength={120} value={label} onChange={event => setLabel(event.target.value)} disabled={busy} /></label>
      <button className="account-primary" type="button" disabled={busy || Boolean(challenge) || !label.trim()} onClick={() => void run(async () => { await trustSecurityDevice(label.trim()); await load(); setNotice('Đã ghi nhớ thiết bị này.') })}>Ghi nhớ thiết bị này</button></div>
      <button className="account-text-button" type="button" disabled={busy} onClick={() => open('sessions')}>Quản lý phiên đăng nhập<ChevronRight size={18} aria-hidden="true" /></button>
      {overview.devices.length === 0 && <p className="account-empty">Chưa có thiết bị tin cậy.</p>}
      {overview.devices.map(device => <div className="account-security-list-row" key={String(device.id)}><LaptopMinimal size={27} aria-hidden="true" /><div><strong>{String(device.label)}</strong><p>{device.revoked_at ? 'Đã thu hồi' : `Hết hạn: ${dateLabel(device.expires_at)}`}</p></div>{activeDevices.includes(device) && <button type="button" className="account-text-button account-danger" disabled={busy || Boolean(challenge)} onClick={() => void run(() => requestSensitiveAction(async () => { await revokeSecurityDevice(String(device.id)); await cancelMfaLogin() }))}>Thu hồi và đăng xuất</button>}</div>)}</>}
      {view === 'sessions' && overview && <><h3>Phiên đăng nhập</h3><p>Kiểm tra các phiên truy cập tài khoản. Đăng xuất tất cả sẽ thu hồi cả thiết bị tin cậy.</p><button className="account-text-button account-danger" type="button" disabled={busy} onClick={() => setConfirmAll(true)}><LogOut size={18} aria-hidden="true" />Đăng xuất tất cả thiết bị</button>{confirmAll && <div className="account-alert" role="alert"><p>Thao tác này thu hồi mọi phiên và thiết bị tin cậy, bao gồm phiên hiện tại.</p><div className="account-buttons"><button className="account-secondary" type="button" disabled={busy} onClick={() => setConfirmAll(false)}>Hủy</button><button className="account-primary" type="button" disabled={busy} onClick={() => void run(() => requestSensitiveAction(revokeSecuritySessions))}>Xác nhận đăng xuất tất cả</button></div></div>}{overview.sessions.length === 0 && <p className="account-empty">Chưa có phiên đăng nhập để hiển thị.</p>}{overview.sessions.map(session => <div className="account-security-list-row" key={String(session.id)}><UserRound size={27} aria-hidden="true" /><div><strong>{session.current ? 'Phiên hiện tại' : 'Phiên khác'}</strong><p>Hoạt động: {dateLabel(session.last_activity_at)}</p></div><span className={activeSessions.includes(session) ? 'account-status' : 'account-setting-meta'}>{session.revoked_at ? 'Đã thu hồi' : activeSessions.includes(session) ? 'Đang hoạt động' : 'Đã hết hạn'}</span></div>)}</>}
      {view === 'activity' && overview && <><h3>Hoạt động bảo mật gần đây</h3><p>Lịch sử xác minh, thiết bị và phiên đăng nhập của tài khoản.</p>{overview.events.length === 0 && <p className="account-empty">Chưa có hoạt động bảo mật.</p>}{overview.events.map(event => <div className="account-security-list-row" key={String(event.id)}><History size={24} aria-hidden="true" /><div><strong>{events[String(event.event_type)] || 'Thay đổi bảo mật'}</strong><p>{dateLabel(event.created_at)}</p></div>{event.success === false && <span className="account-danger">Không thành công</span>}</div>)}</>}
    </section>}
    </div>
  </div>
}







