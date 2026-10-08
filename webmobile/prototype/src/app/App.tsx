import { useEffect, useRef, useState, type ComponentType, type InputHTMLAttributes, type PropsWithChildren } from 'react'
import { ArrowLeft, CalendarDays, Camera, Check, CheckCircle2, ChevronRight, CircleDollarSign, Droplet, Home, ImagePlus, LoaderCircle, Menu, RotateCcw, Scan, X, Zap } from 'lucide-react'
import { history, money, tenants, type TenantKind } from './fixtures'
import { checkMeterReading, parseManualReading, recognizeMeter, type Meter, type MeterReadResult, type ReadingSource } from './meter-reading'
import { assessReading, demoMeterContexts } from './meter-policy.mjs'
import PaymentScreen from './PaymentScreen'
import MeterCamera from './MeterCamera'
import { createDemoInvoice, DemoPaymentError, getDemoInvoice, type DemoPayment } from './demo-payments'
import type { TenantProfile } from './auth-client'

type Screen = 'home' | 'capture' | 'camera' | 'review' | 'complete' | 'payment' | 'history' | 'detail' | 'menu'
type Photo = { url: string; sample: boolean; status: 'reading' | 'ready' | 'failed'; result?: Extract<MeterReadResult, { ok: true }>; reason?: string; unavailable?: boolean; manual?: boolean; value?: string; confirmed?: { reading: number; source: ReadingSource; confirmationToken: string } }
type Photos = Partial<Record<Meter, Photo>>
type Props = { ScrollContainer?: ComponentType<PropsWithChildren<{ className?: string }>>; ReadingInput?: ComponentType<InputHTMLAttributes<HTMLInputElement>>; framed?: boolean; signedIn?: TenantProfile; onLogout?: () => Promise<void> }
const NativeScroll = ({ children, className }: PropsWithChildren<{ className?: string }>) => <div className={className}>{children}</div>
const NativeReadingInput = (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />
const initial = new URLSearchParams(window.location.search)
const label = { electric: 'điện', water: 'nước' }

export default function App({ ScrollContainer = NativeScroll, ReadingInput = NativeReadingInput, framed = false, signedIn, onLogout }: Props) {
  const [kind, setKind] = useState<TenantKind>(signedIn?.kind || (initial.get('tenant') === 'new' ? 'new' : 'existing'))
  const [screen, setScreen] = useState<Screen>(initial.get('screen') === 'capture' ? 'capture' : 'home')
  const [meter, setMeter] = useState<Meter>('electric')
  const [photos, setPhotos] = useState<Photos>({})
  const [completed, setCompleted] = useState(false)
  const [selected, setSelected] = useState(history[0])
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [payment, setPayment] = useState<DemoPayment | null>(null)
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [invoiceAttempt, setInvoiceAttempt] = useState(0)
  const [paymentError, setPaymentError] = useState('')
  const [cloudOcrPending, setCloudOcrPending] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const objectURLs = useRef(new Set<string>())
  const activeRead = useRef<AbortController | null>(null)
  const readVersion = useRef(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const tenant = signedIn || tenants[kind]
  const currentInvoice = payment?.invoice.contractId === tenant.contractId ? payment.invoice : null
  const paidHistory = currentInvoice?.status === 'paid' ? [{ id: currentInvoice.id, contractId: currentInvoice.contractId, month: `${String(currentInvoice.month).padStart(2, '0')}/${currentInvoice.year}`, rent: currentInvoice.lines[0].amount, electric: currentInvoice.lines[1].amount, water: currentInvoice.lines[2].amount, wifi: currentInvoice.details.wifi_cost, garbage: currentInvoice.details.garbage_cost, total: currentInvoice.total, date: new Date(currentInvoice.receipt!.date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Bangkok' }) }] : []
  const ownHistory = [...paidHistory, ...history.filter(item => item.contractId === tenant.contractId)]
  const paymentStorageKey = `ankhanghome.demo.payment.${tenant.contractId}`
  function cachePayment(next: DemoPayment | null) { try { if (next) sessionStorage.setItem(paymentStorageKey, JSON.stringify(next)); else sessionStorage.removeItem(paymentStorageKey) } catch { /* Session storage is optional for a local demo. */ } }
  useEffect(() => () => { activeRead.current?.abort(); objectURLs.current.forEach(url => URL.revokeObjectURL(url)) }, [])
  useEffect(() => { document.title = `AN KHANG HOME · Phòng ${tenant.room}` }, [tenant.room])
  useEffect(() => {
    if (['127.0.0.1', 'localhost'].includes(window.location.hostname) || window.location.protocol !== 'https:') return
    const controller = new AbortController()
    fetch('/api/health', { signal: controller.signal }).then(response => response.json()).then(health => { if (!controller.signal.aborted) setCloudOcrPending(health.backend === 'online' && health.ocrConfigured === false) }).catch(() => {})
    return () => controller.abort()
  }, [])
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [screen, meter])
  useEffect(() => {
    const controller = new AbortController()
    let cached: DemoPayment | null = null
    try { cached = JSON.parse(sessionStorage.getItem(paymentStorageKey) || 'null') } catch { cachePayment(null) }
    if (cached?.invoice?.demo && cached.invoice.contractId === tenant.contractId && typeof cached.accessToken === 'string') {
      const saved = cached
      getDemoInvoice(saved, controller.signal).then(invoice => { if (!controller.signal.aborted) { setPayment({ ...saved, invoice }); setCompleted(true) } }).catch(() => { if (!controller.signal.aborted) cachePayment(null) })
    }
    return () => controller.abort()
  }, [tenant.contractId])
  useEffect(() => {
    if (!payment || payment.invoice.contractId !== tenant.contractId || payment.invoice.status === 'paid') return
    const controller = new AbortController(); let syncing = false
    async function sync() {
      if (syncing || controller.signal.aborted) return
      syncing = true
      try {
        const invoice = await getDemoInvoice(payment!, controller.signal)
        if (controller.signal.aborted) return
        const next = { ...payment!, invoice }; setPayment(next); cachePayment(next); setPaymentError('')
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof DemoPaymentError && cause.status === 404) { cachePayment(null); setPayment(null); setCompleted(false) }
        setPaymentError(cause instanceof Error ? cause.message : 'Chưa cập nhật được thanh toán demo.')
      } finally { syncing = false }
    }
    void sync(); const timer = window.setInterval(sync, 2000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [payment?.invoice.id, payment?.invoice.status, payment?.accessToken, tenant.contractId])
  useEffect(() => {
    if (screen !== 'complete' || payment || !photos.electric?.confirmed || !photos.water?.confirmed) return
    const controller = new AbortController(); setCreatingInvoice(true); setPaymentError('')
    createDemoInvoice(tenant.contractId, photos.electric.confirmed.confirmationToken, photos.water.confirmed.confirmationToken, controller.signal).then(next => {
      if (controller.signal.aborted) return
      setPayment(next); cachePayment(next); go('payment')
    }).catch(cause => { if (!controller.signal.aborted) setPaymentError(cause instanceof Error ? cause.message : 'Chưa lập được hóa đơn demo.') }).finally(() => { if (!controller.signal.aborted) setCreatingInvoice(false) })
    return () => { controller.abort(); setCreatingInvoice(false) }
  }, [screen, tenant.contractId, photos.electric?.confirmed?.confirmationToken, photos.water?.confirmed?.confirmationToken, invoiceAttempt])
  const photo = photos[meter]
  const unit = meter === 'electric' ? 'kWh' : 'm³'
  const proposedReading = photo?.manual ? parseManualReading(photo.value || '') : photo?.result?.reading ?? null
  const meterContext = demoMeterContexts[tenant.contractId]?.[meter]
  const assessment = proposedReading === null ? null : assessReading(proposedReading, meter, meterContext)
  const imagePassed = photo?.status === 'ready' && photo.result?.assessment.status === 'pass' && !!photo.result.reviewToken
  const canConfirm = !!photo && !checking && !error && proposedReading !== null && imagePassed && assessment?.status === 'pass'
  useEffect(() => {
    if (screen !== 'review' || !photo || photo.status !== 'reading' || photo.manual) return
    const controller = new AbortController(); activeRead.current = controller
    const version = ++readVersion.current
    recognizeMeter(photo.url, meter, tenant.contractId, controller.signal).then(result => {
      if (controller.signal.aborted || readVersion.current !== version) return
      setPhotos(old => old[meter]?.url === photo.url ? { ...old, [meter]: { ...old[meter]!, status: result.ok ? 'ready' : 'failed', result: result.ok ? result : undefined, reason: result.ok ? undefined : result.reason, unavailable: !result.ok && result.code === 'OCR_NOT_CONFIGURED' } } : old)
    }).catch(cause => {
      if (controller.signal.aborted || readVersion.current !== version) return
      setPhotos(old => old[meter]?.url === photo.url ? { ...old, [meter]: { ...old[meter]!, status: 'failed', reason: cause?.name === 'TimeoutError' ? 'Dịch vụ đọc số phản hồi chậm. Hãy thử lại sau ít giây.' : 'Chưa đọc được ảnh. Hãy thử lại hoặc chụp lại rõ hơn.' } } : old)
    })
    return () => { controller.abort(); if (readVersion.current === version) readVersion.current++ }
    // Reading updates do not restart requests; a new photo or navigation does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, meter, photo?.url])

  function cancelReading() { readVersion.current++; activeRead.current?.abort(); setChecking(false) }
  function go(next: Screen) { cancelReading(); setError(''); setScreen(next); window.scrollTo({ top: 0 }) }
  function resetTenant(next: TenantKind) {
    if (signedIn) return
    if (next === kind) { go('home'); return }
    objectURLs.current.forEach(url => URL.revokeObjectURL(url)); objectURLs.current.clear()
    setKind(next); setPhotos({}); setCompleted(false); setPayment(null); setPaymentError(''); setMeter('electric'); go('home')
    const url = new URL(window.location.href); url.search = next === 'new' ? '?tenant=new' : ''; window.history.replaceState(null, '', url)
  }
  function begin() { if (currentInvoice) { go('payment'); return } setMeter('electric'); go(completed && photos.electric ? 'review' : 'capture') }
  function setPhoto(next: Pick<Photo, 'url' | 'sample'>) {
    cancelReading(); setCompleted(false)
    for (const key of meter === 'electric' ? ['electric', 'water'] as Meter[] : ['water'] as Meter[]) {
      const previous = photos[key]
      if (previous && !previous.sample && previous.url !== next.url) { URL.revokeObjectURL(previous.url); objectURLs.current.delete(previous.url) }
    }
    setPhotos(old => ({ ...(meter === 'electric' ? {} : old), [meter]: { ...next, status: 'reading' } }))
    go('review')
  }
  function loadFile(file?: File) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Chọn ảnh JPG, PNG hoặc WebP.'); return }
    if (file.size > 10 * 1024 * 1024) { setError('Ảnh tối đa 10 MB. Hãy chọn ảnh nhỏ hơn.'); return }
    acceptPhoto(file)
  }
  function acceptPhoto(blob: Blob) {
    const url = URL.createObjectURL(blob); objectURLs.current.add(url)
    setPhoto({ url, sample: false })
  }
  async function nextPhoto() {
    if (!canConfirm || proposedReading === null || !photo?.result?.reviewToken) return
    const controller = new AbortController(); activeRead.current = controller
    const version = ++readVersion.current; setChecking(true)
    try {
      const checked = await checkMeterReading(proposedReading, meter, tenant.contractId, photo.result.reviewToken, photo.manual ? 'manual' : 'ai-ocr', controller.signal)
      if (controller.signal.aborted || readVersion.current !== version) return
      if (!checked.ok || !checked.source || !checked.confirmationToken) { setError(checked.reason); return }
      setPhotos(old => ({ ...old, [meter]: { ...old[meter]!, confirmed: { reading: proposedReading, source: checked.source!, confirmationToken: checked.confirmationToken! } } }))
      if (meter === 'electric') { setMeter('water'); go(photos.water ? 'review' : 'capture') }
      else if (photos.electric?.confirmed) { setCompleted(true); go('complete') }
    } catch {
      if (!controller.signal.aborted && readVersion.current === version) setError('Chưa kiểm tra được chỉ số. Hãy thử lại sau.')
    } finally { if (readVersion.current === version) setChecking(false) }
  }
  function retake() {
    cancelReading(); setCompleted(false)
    if (photo && !photo.sample) { URL.revokeObjectURL(photo.url); objectURLs.current.delete(photo.url) }
    setPhotos(old => { const next = { ...old }; delete next[meter]; return next }); go('capture')
  }
  function manualReading(value?: string) {
    if (!imagePassed) return
    cancelReading(); setCompleted(false); setError('')
    setPhotos(old => ({ ...old, [meter]: { ...old[meter]!, manual: true, value: value ?? '', confirmed: undefined } }))
  }
  const isHome = screen === 'home'
  const screenTitle = screen === 'payment' ? currentInvoice?.status === 'paid' ? 'Biên lai' : 'Thanh toán' : screen === 'camera' ? 'Camera' : screen === 'menu' ? 'Tài khoản' : screen === 'history' ? 'Lịch sử thanh toán' : screen === 'detail' ? `Hóa đơn ${selected.month}` : 'Chụp điện & nước'
  return <div className={`tenant-app ${framed ? 'framed-app' : ''} ${isHome ? 'home-state' : screen === 'capture' ? 'capture-state' : screen === 'payment' ? 'payment-state' : ''}`}>
    <header className={isHome ? 'brand-header' : 'flow-header'}>
      {isHome ? <><img src="/assets/brand-white.png" width="232" height="78" alt="AN KHANG HOME" /><button className="icon-button" aria-label="Mở menu" onClick={() => go('menu')}><Menu /></button></> : <><button className="icon-button" aria-label="Quay lại" onClick={() => go(screen === 'detail' ? 'history' : ['review', 'camera'].includes(screen) ? 'capture' : 'home')}><ArrowLeft /></button><h1>{screenTitle}</h1></>}
    </header>
    <ScrollContainer className="app-scroll" key={`${kind}-${screen}-${meter}`}>
      <main className={`app-content ${isHome ? 'home-content' : screen === 'capture' || screen === 'review' ? 'capture-content' : ''}`}>
        {['capture', 'camera'].includes(screen) && <input ref={fileInput} tabIndex={-1} className="file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Chọn ảnh công tơ ${label[meter]}`} onChange={e => { loadFile(e.target.files?.[0]); e.target.value = '' }} />}
        {screen === 'camera' && <MeterCamera meterLabel={label[meter]} onPhoto={acceptPhoto} onCancel={() => go('capture')} onFile={() => fileInput.current?.click()} />}
        {isHome && <>
          <p className="greeting">Xin chào</p><h2 className="tenant-name" ref={heading} tabIndex={-1}>{tenant.name}</h2>
          <h1 className="room-title">Phòng {tenant.room}</h1>
          <dl className="room-details">
            <div><dt><Home aria-hidden="true" /><span>Tầng 1 · 22 m²</span></dt></div>
            <div><dt><CircleDollarSign aria-hidden="true" /><span>Giá thuê hiện tại</span></dt><dd>3.000.000đ/tháng</dd></div>
            <div><dt><CalendarDays aria-hidden="true" /><span>Ngày bắt đầu</span></dt><dd>{tenant.start}</dd></div>
          </dl>
          <section className="meter-task" aria-labelledby="meter-task-title">
            <div className="task-heading"><h2 id="meter-task-title">{kind === 'new' ? currentInvoice ? 'Hóa đơn tháng đầu' : 'Chụp công tơ bàn giao' : 'Điện nước tháng 09/2026'}</h2>{(kind === 'existing' || currentInvoice) && <span className={`badge ${currentInvoice?.status === 'paid' ? 'paid' : 'pending'}`}>{currentInvoice?.status === 'paid' ? 'Đã thanh toán demo' : currentInvoice ? 'Chờ thanh toán' : completed ? 'Đã xác nhận thử' : 'Chưa gửi ảnh'}</span>}</div>
            <p>{cloudOcrPending && !currentInvoice ? 'Bản demo · AI chờ cấu hình.' : currentInvoice ? currentInvoice.status === 'paid' ? 'Đã khớp giao dịch SePay mô phỏng.' : `Hóa đơn demo còn ${money(currentInvoice.remaining)}.` : completed ? 'Bạn đã xác nhận hai chỉ số trong phiên thử này.' : kind === 'new' ? 'Ghi nhận điện và nước khi nhận phòng.' : 'Chụp công tơ để nhận hóa đơn.'}</p>
            <button className="primary-button" onClick={begin}>{currentInvoice ? <CircleDollarSign aria-hidden="true" /> : <Camera aria-hidden="true" />}{currentInvoice ? currentInvoice.status === 'paid' ? 'Xem biên lai demo' : 'Xem hóa đơn & thanh toán' : completed ? 'Xem lại điện & nước' : 'Chụp điện & nước'}</button>
          </section>
          {ownHistory.length > 0 && <button className="history-launcher" onClick={() => go('history')}><CircleDollarSign aria-hidden="true" /><span>Lịch sử thanh toán</span><ChevronRight aria-hidden="true" /></button>}
        </>}
        {(screen === 'capture' || screen === 'review') && <>
          <div className="capture-steps" aria-label="Tiến độ chụp"><div className={meter === 'electric' ? 'active' : 'finished'}>{meter === 'water' ? <Check aria-hidden="true" /> : <Zap aria-hidden="true" />}<span>Điện</span></div><div className={meter === 'water' ? 'active' : ''}><Droplet aria-hidden="true" /><span>Nước</span></div></div>
          <progress max="2" value={meter === 'electric' ? 1 : 2} aria-label="Bước chụp công tơ" />
          <h2 className="capture-title" ref={heading} tabIndex={-1}>{screen === 'review' ? `Xác nhận số ${label[meter]}` : `Chụp công tơ ${label[meter]}`}</h2><p className="capture-room">Phòng {tenant.room}</p>
          <p className="capture-hint">{screen === 'review' ? 'Đối chiếu chỉ số với dãy số trong ảnh.' : 'Chụp gần một mặt công tơ, đủ dãy số và tránh lóa kính.'}</p>
          <figure className={`meter-photo ${screen === 'review' ? 'review-photo' : ''}`}><img src={screen === 'review' ? photos[meter]?.url : `/assets/meter-${meter}.webp`} alt={screen === 'review' ? `Ảnh công tơ ${label[meter]} đã chọn` : `Ảnh minh họa công tơ ${label[meter]}`} onError={() => { cancelReading(); setError('Không đọc được ảnh. Hãy chọn ảnh JPG hoặc PNG khác.') }} />{screen === 'capture' && <><Scan className="scan-guide" aria-hidden="true" preserveAspectRatio="none" /><span className="photo-example">Ảnh minh họa</span></>}</figure>
          <p className="photo-caption">{screen === 'review' && photos[meter]?.sample ? 'Ảnh mẫu để thử giao diện.' : 'Chụp rõ số, tránh lóa sáng.'}</p>
          {screen === 'review' && <details className="meter-zoom"><summary>Phóng to ảnh để đối chiếu</summary><img src={photos[meter]?.url} alt={`Ảnh phóng to công tơ ${label[meter]}`} /></details>}{error && <p role="alert" className="error-message">{error}</p>}
          {screen === 'capture' ? <><button className="primary-button" onClick={() => go('camera')}><Camera aria-hidden="true" />Chụp ảnh {label[meter]}</button><button className="secondary-button" onClick={() => { setError(''); fileInput.current?.click() }}><ImagePlus aria-hidden="true" />Chọn ảnh đã chụp</button><div className="capture-footer"><p>{meter === 'electric' ? 'Tiếp theo: công tơ nước.' : 'Bước cuối: xác nhận chỉ số nước.'}</p><p>Ảnh được đọc ngay sau khi chụp hoặc chọn.</p></div><button className="sample-button" onClick={() => { setPhoto({ url: `/assets/meter-${meter}.webp`, sample: true }) }}><ImagePlus aria-hidden="true" />Dùng ảnh mẫu để thử</button></> : <>
            <section className={`reading-card ${(photo?.status === 'failed' && !photo.manual) || (assessment && assessment.status !== 'pass') ? 'reading-failed' : ''}`} aria-live="polite" aria-busy={photo?.status === 'reading' && !photo.manual}>
              {photo?.manual ? <><label htmlFor="meter-reading">Chỉ số {label[meter]} bạn tự nhập ({unit})</label><ReadingInput id="meter-reading" inputMode="numeric" type="text" maxLength={8} autoComplete="off" value={photo.value || ''} placeholder="Ví dụ: 12692" onChange={e => manualReading(e.target.value)} aria-describedby="reading-help" /><p id="reading-help">Chỉ nhập số nguyên trên công tơ, bỏ phần số đỏ. Số tự nhập chưa được AI xác minh.</p>{photo.value && proposedReading === null && <p role="alert" className="manual-error">Nhập từ 1 đến 8 chữ số, không có dấu chấm hoặc dấu phẩy.</p>}</>
              : photo?.status === 'reading' ? <><div className="reading-status"><LoaderCircle className="reading-spinner" aria-hidden="true" />Đang đọc và kiểm tra dãy số…</div><p>Vui lòng chờ. Chỉ số sẽ hiện tại đây để bạn đối chiếu.</p></>
              : photo?.status === 'ready' ? <><span className="reading-status"><CheckCircle2 aria-hidden="true" />{assessment?.status === 'pass' ? 'Chỉ số AI đọc được' : 'Chỉ số cần kiểm tra'}</span><strong className="reading-number">{photo.result?.digits}<small>{unit}</small></strong><p>Kiểm tra từng chữ số trong ảnh trước khi xác nhận.</p></>
              : <><strong>{photo?.unavailable ? 'AI online chưa được cấu hình' : 'Chưa đọc rõ chỉ số'}</strong><p>{photo?.reason || 'Hãy chụp lại dãy số rõ hơn.'}</p></>}
              {proposedReading !== null && meterContext?.previousReading !== null && meterContext?.previousReading !== undefined && <dl className="reading-comparison"><div><dt>Số cũ mẫu</dt><dd>{meterContext.previousReading} {unit}</dd></div><div><dt>{assessment?.usage !== null && assessment?.usage !== undefined && assessment.usage < 0 ? 'Chênh lệch bất thường' : 'Mức tăng kỳ này'}</dt><dd>{assessment?.usage ?? '—'} {unit}</dd></div></dl>}
              {assessment && assessment.status !== 'pass' && <p className="reading-warning" role="alert">{assessment.reason}</p>}
              {photo?.status === 'ready' && photo.result?.assessment.status !== 'pass' && photo.result?.assessment.reason !== assessment?.reason && <p className="reading-warning" role="alert">{photo.result?.assessment.reason}</p>}
              {photo?.status === 'ready' && <p className="reading-fixture-note">Đang thử quy tắc với dữ liệu mẫu; chưa lấy chỉ số kỳ trước từ hệ thống thật.</p>}
            </section>
            <button className="primary-button" disabled={!canConfirm} onClick={nextPhoto}>{checking ? <LoaderCircle className="reading-spinner" aria-hidden="true" /> : <Check aria-hidden="true" />}{checking ? 'Đang kiểm tra chỉ số…' : meter === 'electric' ? 'Xác nhận số điện & chụp nước' : 'Xác nhận số nước & lập hóa đơn'}</button><button className="secondary-button" onClick={retake}><RotateCcw aria-hidden="true" />Chụp lại</button>{!photo?.manual && imagePassed && <button className="text-button manual-button" onClick={() => manualReading(photo?.result?.digits)}>Sửa chỉ số đã đọc</button>}<p className="demo-note">{photo?.unavailable ? 'Chức năng đọc số đang chờ cấu hình API AI. Hóa đơn và thanh toán dùng dữ liệu demo.' : 'Ảnh không rõ hoặc sai loại công tơ phải chụp lại. Hóa đơn và thanh toán dùng dữ liệu demo.'}</p></>}
        </>}
        {screen === 'complete' && <section className="completion"><CheckCircle2 className="completion-icon" aria-hidden="true" /><h2 ref={heading} tabIndex={-1}>Đã xác nhận điện & nước</h2><p>Phòng {tenant.room}</p><div className="photo-pair">{(['electric', 'water'] as Meter[]).map(key => <figure key={key}><img src={photos[key]?.url} alt={`Ảnh ${label[key]} đã chọn`} /><figcaption>Công tơ {label[key]}<strong>{photos[key]?.confirmed?.reading} {key === 'electric' ? 'kWh' : 'm³'}</strong><span>{photos[key]?.confirmed?.source === 'manual' ? 'Bạn tự nhập · đã xác nhận' : 'AI đọc · bạn đã xác nhận'}</span></figcaption></figure>)}</div>{creatingInvoice ? <p className="demo-note" role="status">Đang lập hóa đơn demo…</p> : paymentError ? <><p className="error-message" role="alert">{paymentError}</p><button className="primary-button" onClick={() => setInvoiceAttempt(value => value + 1)}>Thử lập hóa đơn lại</button></> : <button className="primary-button" onClick={() => currentInvoice ? go('payment') : setInvoiceAttempt(value => value + 1)}>Xem hóa đơn demo</button>}<button className="secondary-button" onClick={() => go('home')}>Về trang chủ</button></section>}
        {screen === 'payment' && payment && currentInvoice && <PaymentScreen payment={payment} syncError={paymentError} onHome={() => go('home')} />}
        {screen === 'payment' && !currentInvoice && <section><p className="error-message">Phiên hóa đơn demo đã hết. Hãy quay về trang chủ và chụp lại.</p><button className="secondary-button" onClick={() => go('home')}>Về trang chủ</button></section>}
        {screen === 'history' && <section><h2 className="section-title" ref={heading} tabIndex={-1}>Thanh toán của bạn</h2><p className="section-hint">Phòng {tenant.room} · Từ {tenant.start}</p>{ownHistory.length ? ownHistory.map(item => <button className="history-card" key={item.id} onClick={() => { setSelected(item); go('detail') }}><span>Tháng {item.month}<span className="badge paid">Đã thanh toán</span></span><strong>{money(item.total)}<ChevronRight aria-hidden="true" /></strong></button>) : <p className="empty-state">Bạn chưa có thanh toán trong hợp đồng hiện tại.</p>}</section>}
        {screen === 'detail' && ownHistory.some(item => item.id === selected.id) && <section><span className="badge paid">Đã thanh toán</span><h2 className="invoice-total" ref={heading} tabIndex={-1}>{money(selected.total)}</h2><p className="section-hint">Phòng {tenant.room} · Tháng {selected.month}</p><dl className="invoice-lines"><div><dt>Tiền phòng</dt><dd>{money(selected.rent)}</dd></div><div><dt>Tiền điện</dt><dd>{money(selected.electric)}</dd></div><div><dt>Tiền nước</dt><dd>{money(selected.water)}</dd></div>{'wifi' in selected && <div><dt>Internet / WiFi</dt><dd>{money(Number(selected.wifi))}</dd></div>}{'garbage' in selected && <div><dt>Phí vệ sinh</dt><dd>{money(Number(selected.garbage))}</dd></div>}<div><dt>Ngày thanh toán</dt><dd>{selected.date}</dd></div></dl><p className="demo-note">Hóa đơn mẫu của người thuê hiện tại.</p><button className="secondary-button" onClick={() => go('home')}>Về trang chủ</button></section>}
        {screen === 'menu' && <section><h2 className="section-title" ref={heading} tabIndex={-1}>{tenant.name}</h2><p className="section-hint">Phòng {tenant.room}</p><button className="menu-item" onClick={() => go('home')}><Home aria-hidden="true" />Phòng của bạn<ChevronRight aria-hidden="true" /></button>{ownHistory.length > 0 && <button className="menu-item" onClick={() => go('history')}><CircleDollarSign aria-hidden="true" />Lịch sử thanh toán<ChevronRight aria-hidden="true" /></button>}{!signedIn && <div className="demo-switch"><h3>Thử bản demo</h3><p>Dữ liệu mẫu, chưa kết nối tài khoản thật.</p><button className="menu-item" aria-pressed={kind === 'existing'} onClick={() => resetTenant('existing')}>Khách đang thuê{kind === 'existing' && <Check aria-hidden="true" />}</button><button className="menu-item" aria-pressed={kind === 'new'} onClick={() => resetTenant('new')}>Khách mới{kind === 'new' && <Check aria-hidden="true" />}</button></div>}{signedIn && <><p className="section-hint">{signedIn.email}</p><button className="secondary-button" onClick={() => void onLogout?.()}>Đăng xuất</button></>}<button className="text-button" onClick={() => go('home')}><X aria-hidden="true" />Đóng menu</button></section>}
      </main>
    </ScrollContainer>
  </div>
}
