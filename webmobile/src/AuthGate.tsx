import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import { AuthError, authRequest, type TenantProfile } from './auth-client'

export default function AuthGate({ children }: { children: (profile: TenantProfile, logout: () => Promise<void>) => ReactNode }) {
  const [profile, setProfile] = useState<TenantProfile | null>(null)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false), [error, setError] = useState('')
  const [forgot, setForgot] = useState(false)
  useEffect(() => { if (!profile) document.title = 'AN KHANG HOME · Đăng nhập' }, [profile])
  useEffect(() => {
    let active = true
    authRequest('session').then(next => { if (active) setProfile(next) }).catch(cause => { if (active && (!(cause instanceof AuthError) || cause.status !== 401)) setError(cause.message) }).finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!profile) return
    const lostSession = () => { setProfile(null); setPassword(''); setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.') }
    window.addEventListener('webmobile:unauthorized', lostSession)
    return () => window.removeEventListener('webmobile:unauthorized', lostSession)
  }, [profile])
  async function login(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const next = await authRequest('login', { email: email.trim(), password })
      setPassword(''); setProfile(next)
      const url = new URL(location.href); url.searchParams.delete('tenant'); window.history.replaceState(null, '', url)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Chưa đăng nhập được.') }
    finally { setBusy(false) }
  }
  async function logout() {
    if (busy) return
    setBusy(true); setError('')
    try {
      await authRequest('logout'); setProfile(null); setPassword(''); setForgot(false)
      window.scrollTo({ top: 0 })
      for (const id of ['demo-current-101', 'demo-current-102']) sessionStorage.removeItem(`ankhanghome.demo.payment.${id}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Chưa đăng xuất được.') }
    finally { setBusy(false) }
  }
  if (profile) return <>{error && <p className="auth-session-error" role="alert">{error}</p>}{children(profile, logout)}</>
  return <div className="tenant-app auth-page">
    <header className="brand-header"><img src="/assets/brand-white.png" width="232" height="78" alt="AN KHANG HOME" /></header>
    <main className="auth-content">
      <div className="auth-symbol"><LockKeyhole aria-hidden="true" /></div>
      <p className="auth-eyebrow">CỔNG THÔNG TIN NGƯỜI THUÊ</p>
      <h1>{checking ? 'Đang kiểm tra tài khoản' : forgot ? 'Quên mật khẩu' : 'Đăng nhập'}</h1>
      <p className="auth-description">{forgot ? 'Khôi phục tài khoản người thuê của bạn.' : 'Xem phòng của bạn, gửi chỉ số điện nước và thanh toán.'}</p>
      {checking ? <p className="auth-loading" role="status"><LoaderCircle className="reading-spinner" aria-hidden="true" />Đang kiểm tra phiên đăng nhập…</p> : forgot ? <>
        <p className="auth-recovery-note">Vui lòng liên hệ chủ nhà để đặt lại mật khẩu tài khoản của bạn.</p>
        <button className="secondary-button" onClick={() => { setForgot(false); setError('') }}>Quay lại đăng nhập</button>
      </> : <form onSubmit={login}>
        <label htmlFor="login-email">Email</label>
        <div className="auth-input"><Mail aria-hidden="true" /><input id="login-email" type="email" autoComplete="username" inputMode="email" placeholder="Email được chủ nhà cấp" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} /></div>
        <label htmlFor="login-password">Mật khẩu</label>
        <div className="auth-input"><LockKeyhole aria-hidden="true" /><input id="login-password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Nhập mật khẩu" required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /><button type="button" aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div>
        {error && <p className="error-message" role="alert">{error}</p>}
        <button className="primary-button" disabled={busy} type="submit">{busy && <LoaderCircle className="reading-spinner" aria-hidden="true" />}{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        <button className="auth-forgot" type="button" onClick={() => { setForgot(true); setError('') }}>Quên mật khẩu?</button>
      </form>}
      <p className="auth-footnote">Tài khoản được chủ nhà cấp theo người thuê.</p>
    </main>
  </div>
}
