import { useEffect, useState } from 'react'
import { CalendarDays, CircleDollarSign, Home, LogOut } from 'lucide-react'
import { AuthError, authRequest, type TenantProfile } from './auth-client'

export default function TenantHome({ profile: initial, onLogout }: { profile: TenantProfile; onLogout: () => Promise<void> }) {
  const [profile, setProfile] = useState(initial)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    async function refresh() {
      try { const next = await authRequest('session'); if (active && next) { setProfile(next); setError('') } }
      catch (cause) {
        if (!active) return
        if (cause instanceof AuthError && [401, 403].includes(cause.status)) window.dispatchEvent(new Event('webmobile:unauthorized'))
        else setError('Chưa cập nhật được thông tin phòng. Hãy thử lại sau.')
      }
    }
    const timer = window.setInterval(refresh, 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])
  useEffect(() => { document.title = 'AN KHANG HOME · Phòng của bạn' }, [])
  return <div className="tenant-app home-state">
    <header className="brand-header"><img src="/assets/brand-white.png" width="232" height="78" alt="AN KHANG HOME" /><button className="icon-button" disabled={busy} aria-label="Đăng xuất" onClick={async () => { setBusy(true); try { await onLogout() } finally { setBusy(false) } }}><LogOut /></button></header>
    <main className="app-content home-content">
      <p className="greeting">Xin chào</p><h2 className="tenant-name">{profile.name}</h2>
      <h1 className="room-title">{profile.room ? (/^phòng\s/i.test(profile.room) ? profile.room : `Phòng ${profile.room}`) : 'Phòng của bạn'}</h1>
      {profile.contractId ? <dl className="room-details">
        <div><dt><Home aria-hidden="true" /><span>{[profile.floor != null ? `Tầng ${profile.floor}` : null, profile.area ? `${profile.area} m²` : null].filter(Boolean).join(' · ') || 'Hợp đồng đang hiệu lực'}</span></dt></div>
        <div><dt><CircleDollarSign aria-hidden="true" /><span>Giá thuê hiện tại</span></dt><dd>{profile.rent?.toLocaleString('vi-VN')}đ/tháng</dd></div>
        <div><dt><CalendarDays aria-hidden="true" /><span>Ngày bắt đầu</span></dt><dd>{profile.start ? new Date(`${profile.start}T00:00:00`).toLocaleDateString('vi-VN') : '—'}</dd></div>
      </dl> : <p className="empty-state">Chủ nhà chưa gắn hợp đồng đang hiệu lực cho tài khoản của bạn.</p>}
      <section className="meter-task"><h2 className="section-title" style={{ margin: 0, fontSize: 18 }}>Thông tin thanh toán</h2><p>Chưa có hóa đơn được cung cấp trên website. Chủ nhà sẽ thông báo khi có kỳ điện nước cần xác nhận.</p></section>
      {error && <p className="error-message" role="alert">{error}</p>}
    </main>
  </div>
}
