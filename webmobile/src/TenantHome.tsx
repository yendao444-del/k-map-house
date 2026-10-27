import { useEffect, useRef, useState } from 'react'
import { Box as Package, BrushCleaning as Brush, CalendarDays, ChevronRight, CircleDollarSign, Droplet as Droplets, Home, Info, LogOut, Menu, RefreshCw, UserRound, Wifi, X, Zap } from 'lucide-react'
import { AuthError, authRequest, type TenantProfile } from './auth-client'
import TenantPayment from './TenantPayment'

type Screen = 'home' | 'menu' | 'payment' | 'room' | 'account'
type RoomSection = 'general' | 'utilities' | 'equipment'
const money = (value?: number | null) => value == null ? 'Chưa cập nhật' : `${value.toLocaleString('vi-VN')}đ`
const reading = (value?: number | null, unit = '') => value == null ? 'Chưa cập nhật' : `${value.toLocaleString('vi-VN')} ${unit}`
const assetStatus = (status?: string | null) => ({ ok: 'Hoạt động tốt', error: 'Cần sửa chữa', repairing: 'Đang sửa chữa' }[status || ''] || 'Chưa cập nhật tình trạng')

export default function TenantHome({ profile: initial, onLogout }: { profile: TenantProfile; onLogout: () => Promise<void> }) {
  const [profile, setProfile] = useState(initial)
  const [screen, setScreen] = useState<Screen>(new URLSearchParams(location.search).get('screen') === 'payment' ? 'payment' : 'home')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [roomSection, setRoomSection] = useState<RoomSection>('general')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [refreshing, setRefreshing] = useState(false)
  const previous = useRef<Screen>('home'), menuButton = useRef<HTMLButtonElement>(null), heading = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(true), inFlight = useRef(false)
  async function refresh() {
    if (initial.simulation) return
    if (inFlight.current) return
    inFlight.current = true
    setRefreshing(true)
    try { const next = await authRequest('session'); if (mounted.current && next) { setProfile(next); setError('') } }
    catch (cause) {
      if (!mounted.current) return
      if (cause instanceof AuthError && [401, 403].includes(cause.status)) window.dispatchEvent(new Event('webmobile:unauthorized'))
      else setError('Chưa cập nhật được thông tin phòng. Hãy thử lại.')
    } finally { inFlight.current = false; if (mounted.current) setRefreshing(false) }
  }
  useEffect(() => {
    mounted.current = true
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh() }
    const timer = window.setInterval(onFocus, 30000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => { mounted.current = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
  }, [])
  useEffect(() => {
    document.title = `AN KHANG HOME · ${{home:'Phòng của bạn',menu:'Menu',payment:'Thanh toán',room:'Thông tin phòng',account:'Tài khoản'}[screen]}`
    heading.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [screen])
  useEffect(() => {
    if (screen !== 'menu') return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setScreen(previous.current); menuButton.current?.focus() } }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [screen])
  function navigate(next: Screen) { setScreen(next); if (next === 'room') setRoomSection('general'); if (['home','payment','room'].includes(next)) void refresh() }
  function selectRoomSection(next: RoomSection) { setRoomSection(next); if (next !== 'general') void refresh() }
  const roomName = profile.room ? (/^phòng\s/i.test(profile.room) ? profile.room : `Phòng ${profile.room}`) : 'Phòng của bạn'
  const start = profile.start ? new Date(`${profile.start}T00:00:00`).toLocaleDateString('vi-VN') : '—'
  const roomDetails = <dl className="room-details">
    <div><dt><Home aria-hidden="true" /><span>{[profile.floor != null ? `Tầng ${profile.floor}` : null, profile.area ? `${profile.area} m²` : null].filter(Boolean).join(' · ') || 'Hợp đồng đang hiệu lực'}</span></dt></div>
    <div><dt><CircleDollarSign aria-hidden="true" /><span>Giá thuê hiện tại</span></dt><dd>{profile.rent == null ? 'Chưa cập nhật' : `${money(profile.rent)}/tháng`}</dd></div>
    <div><dt><CalendarDays aria-hidden="true" /><span>Ngày bắt đầu</span></dt><dd>{start}</dd></div>
  </dl>
  const utilityDetails = <>
    {profile.invoiceDay != null && <p className="tenant-invoice-day">Ngày lập hóa đơn: ngày {profile.invoiceDay} hằng tháng</p>}
    <div className="tenant-utility-panel">
      <div className="tenant-utilities">
        <section><h2><Zap aria-hidden="true" />Điện</h2><dl><div><dt>Đơn giá</dt><dd>{profile.services ? `${money(profile.services.electricPrice)}/kWh` : 'Chưa cập nhật'}</dd></div><div><dt>Khi nhận phòng</dt><dd>{reading(profile.electricInitial,'kWh')}</dd></div></dl></section>
        <section><h2><Droplets aria-hidden="true" />Nước</h2><dl><div><dt>Đơn giá</dt><dd>{profile.services ? `${money(profile.services.waterPrice)}/m³` : 'Chưa cập nhật'}</dd></div><div><dt>Khi nhận phòng</dt><dd>{reading(profile.waterInitial,'m³')}</dd></div></dl></section>
      </div>
      {profile.services && <dl className="tenant-service-details"><div><dt><Wifi aria-hidden="true" />Internet</dt><dd>{money(profile.services.internetPrice)}/tháng</dd></div><div><dt><Brush aria-hidden="true" />Vệ sinh</dt><dd>{money(profile.services.cleaningPrice)}/tháng</dd></div></dl>}
    </div>
  </>
  const assetList = !profile.contractId ? <p className="empty-state">Tài sản sẽ hiển thị khi có hợp đồng đang hiệu lực.</p> : profile.assets == null ? <p className="error-message" role="status">Chưa tải được danh sách tài sản. Bấm làm mới để thử lại.</p> : profile.assets.length === 0 ? <div className="tenant-assets-empty"><Package aria-hidden="true" /><p>Chủ nhà chưa cập nhật tài sản cho phòng này.</p></div> : <ul className="tenant-assets-list">{profile.assets.map(item => <li key={item.id}><span className="tenant-asset-symbol"><Package aria-hidden="true" /></span><div><h3>{item.name}</h3><p className={`tenant-asset-status ${item.status === 'error' || item.status === 'repairing' ? 'needs-attention' : ''}`}>{assetStatus(item.status)}</p></div><span className="tenant-asset-quantity">SL {item.quantity}</span></li>)}</ul>
  return <div className={`tenant-app home-state tenant-live-app ${cameraOpen ? 'tenant-camera-state' : ''}`}>
    <header className="brand-header tenant-menu-header">
      <button ref={menuButton} className="icon-button" aria-label={screen === 'menu' ? 'Đóng menu' : 'Mở menu'} aria-expanded={screen === 'menu'} aria-controls={screen === 'menu' ? 'tenant-navigation' : undefined} onClick={() => { if (screen === 'menu') { setScreen(previous.current); return } previous.current = screen; setScreen('menu') }}>{screen === 'menu' ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>
      <img src="/assets/brand-white.png" width="232" height="78" alt="AN KHANG HOME" />
      <span className="tenant-header-spacer" aria-hidden="true" />
    </header>
    <main className={`app-content home-content ${cameraOpen ? 'tenant-camera-content' : ''}`}>
      {screen === 'menu' ? <>
        <h1 ref={heading} tabIndex={-1} className="section-title tenant-page-title">Menu</h1>
        <p className="tenant-page-hint">{profile.name} · {roomName}</p>
        <nav id="tenant-navigation" aria-label="Menu người thuê">
          <button className="menu-item" onClick={() => navigate('home')}><Home aria-hidden="true" />Trang chủ<ChevronRight aria-hidden="true" /></button>
          <button className="menu-item" onClick={() => navigate('room')}><Info aria-hidden="true" />Thông tin phòng<ChevronRight aria-hidden="true" /></button>
          <button className="menu-item" onClick={() => navigate('payment')}><CircleDollarSign aria-hidden="true" />Thanh toán<ChevronRight aria-hidden="true" /></button>
          <button className="menu-item" onClick={() => navigate('account')}><UserRound aria-hidden="true" />Tài khoản<ChevronRight aria-hidden="true" /></button>
          <button className="menu-item tenant-logout" disabled={busy} onClick={async () => { setBusy(true); try { await onLogout() } finally { if (mounted.current) setBusy(false) } }}><LogOut aria-hidden="true" />{busy ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
        </nav>
      </> : screen === 'home' ? <div className="tenant-overview">
        <p className="greeting">Xin chào</p><h2 className="tenant-name">{profile.name}</h2>
        <h1 ref={heading} tabIndex={-1} className="room-title">{roomName}</h1>
        {profile.contractId ? <>
          {roomDetails}
          <section className="tenant-overview-services" aria-label="Điện nước và dịch vụ">{utilityDetails}</section>
          <section className="tenant-overview-assets" aria-labelledby="home-assets-title">
            <div className="tenant-section-heading"><h2 id="home-assets-title">Thiết bị trong phòng</h2><button className="tenant-refresh icon-button" disabled={refreshing} aria-label="Làm mới tài sản" onClick={() => void refresh()}><RefreshCw className={refreshing ? 'reading-spinner' : ''} aria-hidden="true" /></button></div>
            {assetList}
          </section>
        </> : <p className="empty-state">Chủ nhà chưa gắn hợp đồng đang hiệu lực cho tài khoản của bạn.</p>}
        <section className="tenant-overview-payment"><h2>Thanh toán</h2><p>Gửi số điện nước, xem hóa đơn và theo dõi thanh toán hằng tháng.</p><button className="tenant-payment-link" onClick={() => navigate('payment')}>Mở mục thanh toán<ChevronRight aria-hidden="true" /></button></section>
      </div> : screen === 'payment' ? <>
        {!cameraOpen && <><h1 ref={heading} tabIndex={-1} className="section-title tenant-page-title">Thanh toán</h1><p className="tenant-page-hint">{profile.contractId ? roomName : 'Tài khoản của bạn'}</p></>}
        {!profile.contractId ? <p className="empty-state">Thanh toán sẽ hiển thị khi có hợp đồng đang hiệu lực.</p> : <TenantPayment key={profile.contractId} profile={profile} onCameraState={setCameraOpen} />}
      </> : screen === 'room' ? <>
        <h1 ref={heading} tabIndex={-1} className="section-title tenant-page-title">Thông tin phòng</h1>
        <p className="tenant-page-hint">{roomName}</p>
        <nav className="tenant-room-sections" aria-label="Các mục thông tin phòng">
          <button aria-pressed={roomSection === 'general'} aria-controls="tenant-room-panel" onClick={() => selectRoomSection('general')}>Thông tin chung</button>
          <button aria-pressed={roomSection === 'utilities'} aria-controls="tenant-room-panel" onClick={() => selectRoomSection('utilities')}>Điện & nước</button>
          <button aria-pressed={roomSection === 'equipment'} aria-controls="tenant-room-panel" onClick={() => selectRoomSection('equipment')}>Thiết bị trong phòng</button>
        </nav>
        <section id="tenant-room-panel" className="tenant-room-panel tenant-overview" aria-labelledby="tenant-room-section-title">
        {profile.contractId ? <>
          {roomSection === 'general' ? <>
            <h2 id="tenant-room-section-title" className="tenant-room-section-title">Thông tin chung</h2>
            {roomDetails}
            {profile.invoiceDay != null && <p className="tenant-invoice-day">Ngày lập hóa đơn: ngày {profile.invoiceDay} hằng tháng</p>}
          </> : roomSection === 'utilities' ? <>
            <h2 id="tenant-room-section-title" className="tenant-room-section-title">Điện & nước</h2>
            {utilityDetails}
          </> : <>
            <div className="tenant-section-heading"><h2 id="tenant-room-section-title" className="tenant-room-section-title">Thiết bị trong phòng</h2><button className="tenant-refresh icon-button" disabled={refreshing} aria-label="Làm mới tài sản" onClick={() => void refresh()}><RefreshCw className={refreshing ? 'reading-spinner' : ''} aria-hidden="true" /></button></div>
            {assetList}
          </>}
        </> : <><h2 id="tenant-room-section-title" className="tenant-room-section-title">{roomSection === 'general' ? 'Thông tin chung' : roomSection === 'utilities' ? 'Điện & nước' : 'Thiết bị trong phòng'}</h2><p className="empty-state">Thông tin sẽ hiển thị khi có hợp đồng đang hiệu lực.</p></>}
        </section>
      </> : <>
        <h1 ref={heading} tabIndex={-1} className="section-title tenant-page-title">Tài khoản</h1>
        <dl className="tenant-account-details"><div><dt>Họ và tên</dt><dd>{profile.name}</dd></div><div><dt>Email đăng nhập</dt><dd>{profile.email}</dd></div><div><dt>Phòng hiện tại</dt><dd>{profile.contractId ? roomName : 'Chưa có hợp đồng đang hiệu lực'}</dd></div></dl>
      </>}
      {error && <div className="error-message" role="alert">{error}<button className="text-button" disabled={refreshing} onClick={() => void refresh()}>Thử lại</button></div>}
    </main>
  </div>
}
