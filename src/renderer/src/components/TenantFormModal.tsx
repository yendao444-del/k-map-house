import React, { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, ClipboardPaste, FileImage, Info, LoaderCircle, Maximize2, Save, UploadCloud, UserPlus, UserRoundPen, X } from 'lucide-react'
import { identityImagesAgree, MAX_IDENTITY_IMAGE_BYTES, normalizeIdentityName, validateTenantIdentity, type IdentityReadResult } from '../../../shared/tenant-identity'
import type { Tenant } from '../lib/db'
import { useTenantEmailCheck } from '../lib/use-tenant-email-check'
import { detectedIdentityDraft, tenantProfilePayload } from '../lib/tenant-profile-draft'
import { useTenantIdentityPhotos } from './TenantIdentityPreview'

type Props = {
  onClose: () => void
  onSubmit: (data: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>) => void
  isPending: boolean
  error?: string | null
  initialTenant?: Tenant
}
type IdentitySide = 'front' | 'back'
const identitySides: IdentitySide[] = ['front', 'back']
const sideLabel = (side: IdentitySide) => side === 'front' ? 'mặt trước' : 'mặt sau'
type IdentityImage = { id: number; side: IdentitySide; dataUrl: string; name: string; result?: IdentityReadResult }

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Không mở được ảnh.'))
    reader.readAsDataURL(file)
  })
}

async function combineImages(images: IdentityImage[]): Promise<string> {
  const loaded = await Promise.all(images.map(image => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Không tạo được bản lưu ảnh CCCD.'))
    img.src = image.dataUrl
  })))
  const canvas = document.createElement('canvas')
  // Keep both faces in the existing identity_image_url column; no schema migration.
  const cellWidth = 900
  const heights = loaded.map(image => Math.round(image.naturalHeight * cellWidth / image.naturalWidth))
  canvas.width = cellWidth * loaded.length
  canvas.height = Math.max(...heights)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Không tạo được bản lưu ảnh CCCD.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  loaded.forEach((image, index) => context.drawImage(image, index * cellWidth, 0, cellWidth, heights[index]))
  return canvas.toDataURL('image/jpeg', 0.9)
}

export function TenantFormModal({ onClose, onSubmit, isPending, error, initialTenant }: Props) {
  const isEdit = Boolean(initialTenant)
  const [images, setImages] = useState<IdentityImage[]>([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState<IdentitySide | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [fullName, setFullName] = useState(initialTenant?.full_name || '')
  const [identityCard, setIdentityCard] = useState(initialTenant?.identity_card || '')
  const [phone, setPhone] = useState(initialTenant?.phone || '')
  const [email, setEmail] = useState(initialTenant?.email || '')
  const emailCheck = useTenantEmailCheck(email)
  const [notes, setNotes] = useState(initialTenant?.notes || '')
  const [replaceIdentity, setReplaceIdentity] = useState(!isEdit)
  const existing = useTenantIdentityPhotos(initialTenant?.identity_image_url)
  const [zoom, setZoom] = useState<{ source: string; side: IdentitySide } | null>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const zoomTrigger = useRef<HTMLElement | null>(null)
  const inputRefs = useRef<Partial<Record<IdentitySide, HTMLInputElement | null>>>({})
  const closeRef = useRef<HTMLButtonElement>(null)
  const imagesRef = useRef<IdentityImage[]>([])
  const active = useRef(true)
  const inFlight = useRef(false)
  const nextId = useRef(0)
  const editedFields = useRef({ fullName: false, identityCard: false })
  const replacementBaseline = useRef({ fullName, identityCard })
  const dialogRef = useRef<HTMLFormElement>(null)
  const pendingRef = useRef(isPending)
  pendingRef.current = isPending

  useEffect(() => {
    active.current = true
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.target instanceof HTMLElement && event.target.closest('[data-identity-viewer]')) return
      if (event.key === 'Escape' && !inFlight.current && !pendingRef.current) onClose()
      if (event.key !== 'Tab') return
      const elements = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="file"]), textarea:not(:disabled)')
      if (!elements?.length) return
      const first = elements[0], last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { active.current = false; document.removeEventListener('keydown', onKey); previous?.focus() }
  }, [onClose])

  useEffect(() => {
    if (!zoom) return
    viewerRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { zoomTrigger.current?.focus() }
  }, [zoom])

  function startReplacement() {
    if (replaceIdentity) return
    replacementBaseline.current = { fullName, identityCard }
    setReplaceIdentity(true)
    setReviewed(false)
  }

  function cancelReplacement() {
    if (inFlight.current || pendingRef.current) return
    updateImages([])
    setReplaceIdentity(false)
    setReviewed(false)
    setLocalError(null)
    if (!editedFields.current.fullName) setFullName(replacementBaseline.current.fullName)
    if (!editedFields.current.identityCard) setIdentityCard(replacementBaseline.current.identityCard)
  }

  function applyDetectedFields(result?: IdentityReadResult) {
    const next = detectedIdentityDraft({ fullName, identityCard }, isEdit ? replacementBaseline.current : { fullName: '', identityCard: '' }, editedFields.current, result?.fields)
    // Keep the live field values when a scan resolves after a manual edit.
    if (!editedFields.current.fullName) setFullName(next.fullName)
    if (!editedFields.current.identityCard) setIdentityCard(next.identityCard)
  }

  const updateImages = (next: IdentityImage[]) => {
    next = [...next].sort((a, b) => identitySides.indexOf(a.side) - identitySides.indexOf(b.side))
    imagesRef.current = next
    setImages(next)
  }
  const results = images.map(image => image.result).filter((result): result is IdentityReadResult => !!result)
  const conflict = !identityImagesAgree(results)
  const qr = results.find(result => result.ok && result.source === 'qr')
  const success = results.some(result => result.ok)
  const hasFront = images.some(image => image.side === 'front')
  const hasBack = images.some(image => image.side === 'back')

  async function addImages(incoming: { dataUrl: string; name: string }[], side: IdentitySide) {
    if (inFlight.current || pendingRef.current) return
    if (incoming.length > 1) { setLocalError(`Chọn một ảnh ${sideLabel(side)} cho ô này.`); return }
    if (!incoming.length) return
    if (incoming.some(image => imagesRef.current.some(existing => existing.side !== side && existing.dataUrl === image.dataUrl)) || new Set(incoming.map(image => image.dataUrl)).size !== incoming.length) {
      setLocalError('Ảnh này đã được thêm. Hãy chọn đủ hai mặt khác nhau của CCCD.'); return
    }
    if (!window.api?.tenantIdentity) { setLocalError('Tính năng đọc giấy tờ chưa sẵn sàng. Hãy tải lại ứng dụng.'); return }
    if (incoming.some(image => image.dataUrl.length > MAX_IDENTITY_IMAGE_BYTES * 1.4 + 100)) { setLocalError('Mỗi ảnh tối đa 5 MB.'); return }
    inFlight.current = true
    setBusy(true)
    setLocalError(null)
    setReviewed(false)
    startReplacement()
    const added = incoming.map(image => ({ ...image, id: ++nextId.current }))
    let next: IdentityImage[] = [...imagesRef.current.filter(image => image.side !== side), ...added.map(image => ({ ...image, side }))]
    updateImages(next)
    try {
      for (const image of added) {
        const result = await window.api.tenantIdentity.read(image.dataUrl)
        if (!active.current) return
        next = next.map(item => item.id === image.id ? { ...item, result } : item)
        updateImages(next)
      }
      const all = next.map(image => image.result).filter((result): result is IdentityReadResult => !!result)
      if (!identityImagesAgree(all)) { setLocalError('Hai ảnh có số giấy tờ khác nhau. Hãy kiểm tra và bỏ ảnh không đúng.'); return }
      const best = all.find(result => result.ok && result.source === 'qr') || all.find(result => result.ok)
      // Protect each manually edited field, including edits made before scanning.
      applyDetectedFields(best)
      if (!best?.fields) { setLocalError(all.find(result => result.error)?.error || 'Chưa đọc rõ thông tin. Hãy chọn ảnh rõ hơn.'); return }
    } catch {
      if (active.current) setLocalError('Không đọc được ảnh. Hãy thử lại với ảnh JPG hoặc PNG rõ nét.')
    } finally {
      inFlight.current = false
      if (active.current) setBusy(false)
    }
  }

  async function addFiles(files: File[], side: IdentitySide) {
    if (inFlight.current || pendingRef.current) return
    if (files.length > 1) { setLocalError(`Chọn một ảnh ${sideLabel(side)} cho ô này.`); return }
    if (files.some(file => !['image/jpeg', 'image/png'].includes(file.type) || file.size > MAX_IDENTITY_IMAGE_BYTES)) {
      setLocalError('Vui lòng chọn ảnh JPG hoặc PNG, tối đa 5 MB mỗi ảnh.'); return
    }
    try { await addImages(await Promise.all(files.map(async file => ({ name: file.name, dataUrl: await readFile(file) }))), side) }
    catch { setLocalError('Không mở được ảnh. Hãy chọn lại ảnh.') }
  }

  async function pasteImage(side: IdentitySide) {
    if (inFlight.current || isPending) return
    try {
      const dataUrl = await window.api?.tenantIdentity.clipboard()
      if (!dataUrl) { setLocalError('Clipboard chưa có ảnh JPG/PNG hợp lệ dưới 5 MB. Hãy sao chép ảnh hoặc chọn tệp.'); return }
      if (!active.current) return
      await addImages([{ dataUrl, name: 'Ảnh từ clipboard' }], side)
    } catch { setLocalError('Không đọc được clipboard. Bạn có thể dùng nút Chọn ảnh.') }
  }

  function removeImage(id: number) {
    if (busy || isPending) return
    const next = imagesRef.current.filter(image => image.id !== id)
    updateImages(next)
    setReviewed(false)
    setLocalError(null)
    const best = next.find(image => image.result?.source === 'qr')?.result || next.find(image => image.result?.ok)?.result
    applyDetectedFields(best)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || isPending || conflict || emailCheck.blocked) return
    // Older profiles may have no document number. Contact-only updates must
    // not force a replacement or make those profiles impossible to edit.
    const unchangedLegacyIdentity = isEdit && !replaceIdentity && identityCard === (initialTenant?.identity_card || '')
    const problem = unchangedLegacyIdentity
      ? (!normalizeIdentityName(fullName) ? 'Vui lòng kiểm tra họ và tên khách thuê.' : null)
      : validateTenantIdentity(fullName, identityCard)
    if (problem) { setLocalError(problem); return }
    if (replaceIdentity && (!hasFront || !hasBack)) { setLocalError('Hãy thêm đủ ảnh mặt trước và mặt sau CCCD. Mặt sau có QR dùng để giữ nguyên tên tiếng Việt.'); return }
    if (replaceIdentity && !qr) { setLocalError('Chưa đọc được QR ở mặt sau CCCD. Để tránh sai tên có dấu, hãy thêm ảnh mặt sau rõ hơn.'); return }
    if (replaceIdentity && !reviewed) { setLocalError('Vui lòng xác nhận đã kiểm tra họ tên và số giấy tờ.'); return }
    if (replaceIdentity && qr?.fields?.identityCard !== identityCard.trim()) { setLocalError('Số giấy tờ không khớp với mã QR. Hãy đối chiếu lại với ảnh CCCD.'); return }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setLocalError('Email chưa đúng định dạng.'); return }
    if (phone.trim() && !/^(?:\+84|0)\d{9,10}$/.test(phone.replace(/[\s.-]/g, ''))) { setLocalError('Số điện thoại chưa đúng định dạng.'); return }
    setLocalError(null)
    setBusy(true)
    inFlight.current = true
    try {
      const identityImage = replaceIdentity ? await combineImages(images) : initialTenant?.identity_image_url
      onSubmit(tenantProfilePayload({ fullName, identityCard, phone, email, notes }, initialTenant,
        replaceIdentity ? { image: identityImage!, fields: qr?.fields } : undefined))
    } catch { setLocalError('Không lưu được ảnh giấy tờ. Hãy thử lại.') }
    finally { inFlight.current = false; if (active.current) setBusy(false) }
  }

  const inputClass = 'w-full rounded-lg border border-[var(--brand-border)] bg-white px-3.5 py-3 text-[15px] text-[var(--brand-ink)] outline-none transition placeholder:text-[var(--brand-muted)] focus:border-primary focus:ring-2 focus:ring-primary/15'
  const labelClass = 'mb-2 block text-sm font-semibold text-[var(--brand-ink)]'
  const locked = busy || isPending
  const identityReady = hasFront && hasBack && !!qr && !conflict
  const comparedNumbers = results.filter(result => result.fields?.identityCard).length >= 2
  const status = busy ? 'Đang đọc giấy tờ' : conflict ? 'Cần kiểm tra lại' : identityReady ? 'Đã nhận diện' : replaceIdentity ? 'Đang cập nhật' : initialTenant?.identity_image_url ? 'Giấy tờ đã lưu' : 'Chưa có ảnh CCCD'
  const updatedDate = initialTenant?.updated_at ? new Date(initialTenant.updated_at).toLocaleDateString('vi-VN') : null

  function openImage(event: React.MouseEvent<HTMLButtonElement>, source: string, side: IdentitySide) {
    zoomTrigger.current = event.currentTarget
    setZoom({ source, side })
  }

  return <>
    <div className="tenant-profile-overlay fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !locked) onClose() }}>
      <form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="tenant-form-title" onSubmit={submit} className={'tenant-profile-dialog flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-[14px] border border-[var(--brand-border)] bg-white shadow-2xl ' + (isEdit ? 'max-w-[1040px]' : 'max-w-[860px]')}>
        <header className="tenant-profile-header flex shrink-0 items-center gap-4 border-b border-[var(--brand-border)] px-7 py-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--brand-mint)] text-primary">{isEdit ? <UserRoundPen size={24} /> : <UserPlus size={24} />}</span>
          <div className="min-w-0 flex-1"><h2 id="tenant-form-title" className="text-xl font-bold text-[var(--brand-shell)]">{isEdit ? 'Sửa hồ sơ khách thuê' : 'Thêm khách thuê'}</h2><p className="mt-1 text-sm text-[var(--brand-muted)]">{isEdit ? 'Cập nhật hồ sơ từ ảnh CCCD' : 'Tạo hồ sơ từ ảnh CCCD'}</p></div>
          <button ref={closeRef} type="button" aria-label="Đóng hồ sơ khách thuê" disabled={locked} onClick={onClose} className="shrink-0 rounded-lg p-2 text-[var(--brand-muted)] hover:bg-[var(--brand-mint)] disabled:opacity-40"><X size={21} /></button>
        </header>
        <div className="tenant-profile-content grid min-h-0 overflow-y-auto p-7 md:grid-cols-[1fr_1.08fr] md:gap-7">
          <section className="min-w-0 md:border-r md:border-[var(--brand-border)] md:pr-7">
            <h3 className="mb-4 text-lg font-bold text-[var(--brand-shell)]">Nhận diện CCCD</h3>
            <p className="mb-3 text-xs leading-5 text-[var(--brand-muted)]">{isEdit && !replaceIdentity ? 'Ảnh giấy tờ hiện tại · thay ảnh để đọc lại QR/OCR' : 'Thêm ảnh vào đúng từng mặt · JPG, PNG'}<br />Tối đa 5 MB mỗi ảnh</p>
            <div className="grid grid-cols-2 gap-3">
              {identitySides.map(side => {
                const image = images.find(item => item.side === side)
                const stored = !replaceIdentity ? existing.photos[side] : undefined
                const source = image?.dataUrl || stored
                const label = sideLabel(side)
                const recognised = !!image?.result?.ok
                return <div key={side} className={'tenant-identity-slot flex min-w-0 flex-col rounded-[10px] border border-dashed p-3 text-center transition ' + (dragging === side ? 'border-primary bg-emerald-100' : 'border-emerald-300 bg-[var(--brand-mint)]/60')}
                  onDragOver={event => { event.preventDefault(); if (!locked) setDragging(side) }} onDragLeave={() => setDragging(null)}
                  onDrop={event => { event.preventDefault(); setDragging(null); if (!locked) void addFiles(Array.from(event.dataTransfer.files), side) }}
                  onPaste={event => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); if (!locked) void addFiles(files, side) } }}>
                  <p className="mb-2 text-sm font-semibold text-[var(--brand-shell)]">{side === 'front' ? 'Mặt trước' : 'Mặt sau'}</p>
                  <div className={'tenant-identity-photo relative flex items-center justify-center rounded-md bg-white/60 ' + (isEdit ? 'h-[140px]' : 'h-[124px]')}>
                    {source ? <>
                      <button type="button" aria-label={'Phóng to ảnh ' + label} onClick={event => openImage(event, source, side)} className="group h-full w-full rounded-md focus-visible:outline-2 focus-visible:outline-primary">
                        <img src={source} alt={'Ảnh CCCD ' + label} className="h-full w-full rounded-md object-contain" />
                        <span className="absolute bottom-1 right-1 rounded-md bg-white/90 p-1 text-primary shadow-sm"><Maximize2 size={14} /></span>
                      </button>
                      {image && <button type="button" disabled={locked} aria-label={'Bỏ ảnh ' + label} onClick={() => removeImage(image.id)} className="absolute right-1 top-1 rounded-full bg-white p-1 shadow-sm disabled:opacity-40"><X size={15} /></button>}
                    </> : <div className="text-primary"><UploadCloud size={28} className="mx-auto" /><p className="mt-2 text-[11px] leading-4 text-[var(--brand-muted)]">{existing.loading && !replaceIdentity ? 'Đang tải ảnh…' : existing.photos.error && !replaceIdentity ? 'Không tải được ảnh' : 'Kéo thả ảnh vào đây'}</p></div>}
                  </div>
                  {isEdit && <div className="my-3 min-h-[48px] text-left">
                    <p className={'flex items-center gap-1.5 text-sm font-semibold ' + (recognised ? 'text-primary' : 'text-[var(--brand-muted)]')}>{recognised ? <CheckCircle2 size={17} className="shrink-0" /> : <FileImage size={16} className="shrink-0" />}{recognised ? 'Đã nhận diện' : stored ? 'Ảnh đã lưu' : image ? 'Chưa đọc rõ' : 'Chưa có ảnh'}</p>
                    <p className="mt-1 text-xs leading-4 text-[var(--brand-muted)]">{recognised ? image?.result?.source === 'qr' ? 'Đã đọc mã QR' : 'OCR hoàn tất · cần đối chiếu' : stored ? 'Nhấn ảnh để phóng to' : image ? 'Hãy chọn ảnh rõ hơn' : 'JPG, PNG · tối đa 5 MB'}</p>
                  </div>}
                  <input ref={element => { inputRefs.current[side] = element }} type="file" accept="image/jpeg,image/png" className="hidden" aria-label={'Chọn ảnh ' + label} disabled={locked} onChange={event => { void addFiles(Array.from(event.target.files || []), side); event.target.value = '' }} />
                  <button type="button" disabled={locked} onClick={() => inputRefs.current[side]?.click()} className={(isEdit ? '' : 'mt-3 ') + 'rounded-lg border border-primary bg-white px-2 py-2 text-sm font-semibold text-primary hover:bg-emerald-50 disabled:opacity-40'}>{source ? 'Thay ảnh' : side === 'front' ? 'Mặt trước' : 'Mặt sau'}</button>
                  <button type="button" disabled={locked} aria-label={'Dán ảnh ' + label} onClick={() => void pasteImage(side)} className="mt-2 flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs text-[var(--brand-muted)] hover:bg-emerald-50 disabled:opacity-40"><ClipboardPaste size={13} /> Dán ảnh</button>
                  {!isEdit && image?.result && <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-[var(--brand-muted)]"><FileImage size={12} />{image.result.ok ? image.result.source === 'qr' ? 'Đã đọc QR' : 'Đã đọc OCR' : 'Chưa đọc rõ'}</p>}
                </div>
              })}
            </div>
            <div aria-live="polite" className="mt-4">
              {busy ? <p className="flex items-center gap-2 text-sm text-primary"><LoaderCircle className="animate-spin shrink-0" size={18} />{isPending ? 'Đang lưu hồ sơ…' : 'Đang đọc thông tin…'}</p> :
                identityReady ? <div className="flex items-center gap-2 rounded-lg bg-[var(--brand-mint)] px-3 py-3 text-sm font-semibold text-primary"><CheckCircle2 size={22} className="shrink-0" />{comparedNumbers ? 'Hai ảnh thuộc cùng một giấy tờ' : 'Đã đọc thông tin từ QR'}</div> :
                success && !conflict ? <p className="flex items-center gap-2 text-sm font-semibold text-primary"><CheckCircle2 size={20} />{qr ? 'Đã đọc thông tin từ QR' : 'Đã đọc thông tin từ ảnh'}</p> :
                isEdit && !replaceIdentity && initialTenant?.identity_image_url ? <div className="flex items-center gap-2 rounded-lg bg-[var(--brand-mint)] px-3 py-3 text-sm text-[var(--brand-shell)]"><FileImage size={20} className="shrink-0" />Giữ nguyên giấy tờ hiện tại khi lưu</div> : null}
            </div>
            {isEdit && replaceIdentity && <div className="mt-3"><p className="text-xs leading-5 text-[var(--brand-muted)]">Hãy chọn lại đủ hai mặt. Ảnh cũ được giữ nguyên cho đến khi bạn lưu.</p><button type="button" disabled={locked} onClick={cancelReplacement} className="mt-2 rounded-md py-1 text-xs font-semibold text-primary underline underline-offset-4 disabled:opacity-40">Hủy thay ảnh · giữ giấy tờ cũ</button></div>}
            {isEdit && !replaceIdentity && initialTenant?.identity_image_url && !existing.loading && !existing.photos.error && <button type="button" disabled={locked} onClick={existing.toggleSplit} className="mt-3 rounded-md py-1 text-xs text-[var(--brand-muted)] underline underline-offset-4">{existing.photos.back ? 'Xem ảnh gốc' : 'Tách ảnh ghép hai mặt'}</button>}
            {isEdit && updatedDate && <p className="mt-4 text-xs text-[var(--brand-muted)]">Cập nhật lần cuối: {updatedDate}</p>}
            <p className="mt-4 text-xs leading-5 text-[var(--brand-muted)]">Ưu tiên đọc QR để giữ nguyên tên tiếng Việt có dấu.</p>
          </section>
          <section className="mt-6 min-w-0 md:mt-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-[var(--brand-shell)]">Thông tin khách thuê</h3>
              {isEdit && <div className="flex flex-wrap items-center justify-end gap-2"><span role="status" className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">{identityReady ? <CheckCircle2 size={13} /> : <FileImage size={13} />}{status}</span><button type="button" disabled={locked || replaceIdentity} onClick={startReplacement} className="rounded-lg border border-primary bg-white px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50">Cập nhật ảnh CCCD</button></div>}
            </div>
            <div className="space-y-4">
              <div><label className={labelClass} htmlFor="tenant-full-name">Họ và tên <span className="text-rose-500">*</span></label><input id="tenant-full-name" name="full_name" className={inputClass} placeholder="Tự điền từ ảnh CCCD" value={fullName} disabled={isPending} onChange={event => { setFullName(event.target.value); setReviewed(false); editedFields.current.fullName = true }} /></div>
              <div><label className={labelClass} htmlFor="tenant-identity-card">Số CCCD / CMND <span className="text-rose-500">*</span></label><input id="tenant-identity-card" name="identity_card" className={inputClass} placeholder="Số giấy tờ" inputMode="numeric" maxLength={12} value={identityCard} disabled={isPending} onChange={event => { setIdentityCard(event.target.value.replace(/\D/g, '')); setReviewed(false); editedFields.current.identityCard = true }} /></div>
              <div><label className={labelClass} htmlFor="tenant-phone">Số điện thoại</label><input id="tenant-phone" name="phone" type="tel" className={inputClass} placeholder="Nhập số khách cung cấp" value={phone} disabled={isPending} onChange={event => setPhone(event.target.value)} /></div>
              <div><label className={labelClass} htmlFor="tenant-email">Email</label><input id="tenant-email" name="email" type="email" aria-invalid={Boolean(emailCheck.error)} aria-describedby="tenant-email-help" className={inputClass} placeholder="Nhập email khách cung cấp" value={email} disabled={isPending} onChange={event => setEmail(event.target.value)} /><p id="tenant-email-help" role="status" className={'mt-2 text-xs leading-5 ' + (emailCheck.error ? 'text-rose-700' : 'text-[var(--brand-muted)]')}>{emailCheck.error || (emailCheck.checking ? 'Đang kiểm tra email…' : 'Dùng email riêng của khách để đăng nhập và nhận thông báo.')}</p></div>
              <div><label className={labelClass} htmlFor="tenant-notes">Ghi chú <span className="font-normal text-[var(--brand-muted)]">(không bắt buộc)</span></label><textarea id="tenant-notes" name="notes" className={inputClass + ' resize-none'} placeholder="Biển số xe hoặc thông tin cần lưu ý" rows={2} value={notes} disabled={isPending} onChange={event => setNotes(event.target.value)} /></div>
              {isEdit && <p className="flex items-start gap-2 text-xs leading-5 text-[var(--brand-muted)]"><Info size={16} className="mt-0.5 shrink-0" />OCR không ghi đè các trường đã được chỉnh sửa thủ công.</p>}
              {replaceIdentity && <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-[var(--brand-ink)]"><input type="checkbox" className="mt-1 accent-[var(--brand-primary)]" checked={reviewed} disabled={locked || conflict} onChange={event => setReviewed(event.target.checked)} />Tôi đã đối chiếu họ tên và số giấy tờ với ảnh CCCD.</label>}
            </div>
          </section>
          {(localError || error || conflict) && <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 md:col-span-2"><AlertCircle size={18} className="mt-0.5 shrink-0" />{localError || error || 'Hai ảnh có số giấy tờ khác nhau. Hãy kiểm tra lại.'}</div>}
        </div>
        <footer className="tenant-profile-footer flex shrink-0 justify-end gap-3 border-t border-[var(--brand-border)] bg-[var(--brand-canvas)] px-7 py-4">
          <button type="button" disabled={locked} onClick={onClose} className="rounded-lg border border-[var(--brand-border)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--brand-muted)] hover:bg-emerald-50 disabled:opacity-40">Hủy</button>
          <button type="submit" disabled={locked || emailCheck.blocked || (replaceIdentity && (conflict || !reviewed || !hasFront || !hasBack || !qr))} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40">{locked ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />}{isEdit ? 'Lưu thay đổi' : 'Lưu hồ sơ khách thuê'}</button>
        </footer>
      </form>
    </div>
    {zoom && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={event => { if (event.target === event.currentTarget) setZoom(null) }}>
      <div ref={viewerRef} data-identity-viewer role="dialog" aria-modal="true" aria-label={'Ảnh CCCD ' + sideLabel(zoom.side)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setZoom(null) } if (event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); viewerRef.current?.querySelector('button')?.focus() } }} className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--brand-border)] px-5 py-3"><h3 className="font-semibold text-[var(--brand-shell)]">Giấy tờ định danh · {zoom.side === 'front' ? 'Mặt trước' : 'Mặt sau'}</h3><button type="button" aria-label="Đóng ảnh phóng to" onClick={() => setZoom(null)} className="rounded-lg p-2 text-[var(--brand-muted)] hover:bg-[var(--brand-mint)]"><X size={20} /></button></div>
        <div className="min-h-0 overflow-auto bg-[var(--brand-canvas)] p-3"><img src={zoom.source} alt={'Ảnh CCCD ' + sideLabel(zoom.side)} className="mx-auto max-h-[78dvh] max-w-full object-contain" /></div>
      </div>
    </div>}
  </>
}


