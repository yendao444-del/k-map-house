import React, { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, ClipboardPaste, FileImage, LoaderCircle, Save, UploadCloud, UserPlus, X } from 'lucide-react'
import { identityImagesAgree, MAX_IDENTITY_IMAGE_BYTES, normalizeIdentityName, validateTenantIdentity, type IdentityReadResult } from '../../../shared/tenant-identity'
import type { Tenant } from '../lib/db'
import { useTenantEmailCheck } from '../lib/use-tenant-email-check'

type Props = {
  onClose: () => void
  onSubmit: (data: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>) => void
  isPending: boolean
  error?: string | null
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

export function TenantFormModal({ onClose, onSubmit, isPending, error }: Props) {
  const [images, setImages] = useState<IdentityImage[]>([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState<IdentitySide | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [fullName, setFullName] = useState('')
  const [identityCard, setIdentityCard] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const emailCheck = useTenantEmailCheck(email)
  const [notes, setNotes] = useState('')
  const inputRefs = useRef<Partial<Record<IdentitySide, HTMLInputElement | null>>>({})
  const closeRef = useRef<HTMLButtonElement>(null)
  const imagesRef = useRef<IdentityImage[]>([])
  const active = useRef(true)
  const inFlight = useRef(false)
  const nextId = useRef(0)
  const fieldsVersion = useRef(0)
  const draftEdited = useRef(false)
  const dialogRef = useRef<HTMLFormElement>(null)
  const pendingRef = useRef(isPending)
  pendingRef.current = isPending

  useEffect(() => {
    active.current = true
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
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
    if (!window.api?.tenantIdentity) { setLocalError('Hãy mở tính năng này trong ứng dụng Electron.'); return }
    if (incoming.some(image => image.dataUrl.length > MAX_IDENTITY_IMAGE_BYTES * 1.4 + 100)) { setLocalError('Mỗi ảnh tối đa 5 MB.'); return }
    inFlight.current = true
    setBusy(true)
    setLocalError(null)
    setReviewed(false)
    const version = fieldsVersion.current
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
      // A late result must not replace the landlord's edits made while OCR ran.
      if (fieldsVersion.current === version) {
        setFullName(best?.fields?.fullName || '')
        setIdentityCard(best?.fields?.identityCard || '')
        draftEdited.current = false
      }
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
    if (!draftEdited.current) { setFullName(best?.fields?.fullName || ''); setIdentityCard(best?.fields?.identityCard || '') }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || isPending || conflict || emailCheck.blocked) return
    const problem = validateTenantIdentity(fullName, identityCard)
    if (problem) { setLocalError(problem); return }
    if (!hasFront || !hasBack) { setLocalError('Hãy thêm đủ ảnh mặt trước và mặt sau CCCD. Mặt sau có QR dùng để giữ nguyên tên tiếng Việt.'); return }
    if (!qr) { setLocalError('Chưa đọc được QR ở mặt sau CCCD. Để tránh sai tên có dấu, hãy thêm ảnh mặt sau rõ hơn.'); return }
    if (!reviewed) { setLocalError('Vui lòng xác nhận đã kiểm tra họ tên và số giấy tờ.'); return }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setLocalError('Email chưa đúng định dạng.'); return }
    if (phone.trim() && !/^(?:\+84|0)\d{9,10}$/.test(phone.replace(/[\s.-]/g, ''))) { setLocalError('Số điện thoại chưa đúng định dạng.'); return }
    setLocalError(null)
    setBusy(true)
    inFlight.current = true
    try {
      const identityImage = await combineImages(images)
      const identity = qr?.fields
      onSubmit({ full_name: normalizeIdentityName(fullName), identity_card: identityCard.trim(),
        phone: phone.replace(/[\s.-]/g, ''), email: email.trim(), notes: notes.trim(),
        identity_image_url: identityImage, address: identity?.address || '',
        id_card_issued_date: identity?.issuedDate || undefined, is_active: false })
    } catch { setLocalError('Không lưu được ảnh giấy tờ. Hãy thử lại.') }
    finally { inFlight.current = false; if (active.current) setBusy(false) }
  }

  const inputClass = 'w-full rounded-lg border border-[var(--brand-border)] bg-white px-3.5 py-3 text-[15px] text-[var(--brand-ink)] outline-none transition placeholder:text-[var(--brand-muted)] focus:border-primary focus:ring-2 focus:ring-primary/15'
  const labelClass = 'mb-2 block text-sm font-semibold text-[var(--brand-ink)]'
  const locked = busy || isPending

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !locked) onClose() }}>
    <form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="tenant-form-title" onSubmit={submit} className="flex max-h-[92vh] w-full max-w-[860px] flex-col overflow-hidden rounded-[14px] border border-[var(--brand-border)] bg-white shadow-2xl">
      <header className="flex shrink-0 items-center gap-4 border-b border-[var(--brand-border)] px-7 py-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-mint)] text-primary"><UserPlus size={24} /></span>
        <div className="flex-1"><h2 id="tenant-form-title" className="text-xl font-bold text-[var(--brand-shell)]">Thêm khách thuê</h2><p className="mt-1 text-sm text-[var(--brand-muted)]">Tạo hồ sơ từ ảnh CCCD</p></div>
        <button ref={closeRef} type="button" aria-label="Đóng" disabled={locked} onClick={onClose} className="rounded-lg p-2 text-[var(--brand-muted)] hover:bg-[var(--brand-mint)] disabled:opacity-40"><X size={21} /></button>
      </header>
      <div className="grid min-h-0 overflow-y-auto p-7 md:grid-cols-[1fr_1.08fr] md:gap-7">
        <section className="md:border-r md:border-[var(--brand-border)] md:pr-7">
          <h3 className="mb-4 text-lg font-bold text-[var(--brand-shell)]">Nhận diện CCCD</h3>
          <p className="mb-3 text-xs leading-5 text-[var(--brand-muted)]">Thêm ảnh vào đúng từng mặt · JPG, PNG<br />Tối đa 5 MB mỗi ảnh</p>
          <div className="grid grid-cols-2 gap-3">
            {identitySides.map(side => {
              const image = images.find(item => item.side === side)
              const label = sideLabel(side)
              return <div key={side} className={`flex flex-col rounded-[10px] border border-dashed p-3 text-center transition ${dragging === side ? 'border-primary bg-emerald-100' : 'border-emerald-300 bg-[var(--brand-mint)]/60'}`}
                onDragOver={event => { event.preventDefault(); if (!locked) setDragging(side) }} onDragLeave={() => setDragging(null)}
                onDrop={event => { event.preventDefault(); setDragging(null); if (!locked) void addFiles(Array.from(event.dataTransfer.files), side) }}
                onPaste={event => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); void addFiles(files, side) } }}>
                <p className="mb-2 text-sm font-semibold text-[var(--brand-shell)]">{side === 'front' ? 'Mặt trước' : 'Mặt sau'}</p>
                <div className="relative flex h-[124px] items-center justify-center rounded-md bg-white/60">
                  {image ? <><img src={image.dataUrl} alt={`Ảnh CCCD ${label}`} className="h-full w-full rounded-md object-contain" /><button type="button" disabled={locked} aria-label={`Bỏ ảnh ${label}`} onClick={() => removeImage(image.id)} className="absolute right-1 top-1 rounded-full bg-white p-1 shadow-sm disabled:opacity-40"><X size={15} /></button></> : <div className="text-primary"><UploadCloud size={28} className="mx-auto" /><p className="mt-2 text-[11px] text-[var(--brand-muted)]">Kéo thả ảnh vào đây</p></div>}
                </div>
                <input ref={element => { inputRefs.current[side] = element }} type="file" accept="image/jpeg,image/png" className="hidden" aria-label={`Chọn ảnh ${label}`} disabled={locked} onChange={event => { void addFiles(Array.from(event.target.files || []), side); event.target.value = '' }} />
                <button type="button" disabled={locked} onClick={() => inputRefs.current[side]?.click()} className="mt-3 rounded-lg border border-primary bg-white px-2 py-2 text-sm font-semibold text-primary hover:bg-emerald-50 disabled:opacity-40">{image ? `Thay ${label}` : side === 'front' ? 'Mặt trước' : 'Mặt sau'}</button>
                <button type="button" disabled={locked} aria-label={`Dán ảnh ${label}`} onClick={() => void pasteImage(side)} className="mt-2 flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs text-[var(--brand-muted)] hover:bg-emerald-50 disabled:opacity-40"><ClipboardPaste size={13} /> Dán ảnh</button>
                {image?.result && <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-[var(--brand-muted)]"><FileImage size={12} />{image.result.source === 'qr' ? 'Đã đọc QR' : image.result.source === 'ocr' ? 'Đã đọc OCR' : 'Chưa đọc rõ'}</p>}
              </div>
            })}
          </div>
          <div aria-live="polite" className="mt-4">
            {busy ? <p className="flex items-center gap-2 text-sm text-primary"><LoaderCircle className="animate-spin" size={18} />Đang đọc thông tin…</p> : success && !conflict ? <><p className="flex items-center gap-2 text-sm font-semibold text-primary"><CheckCircle2 size={20} />{qr ? 'Đã đọc thông tin từ QR' : 'Đã đọc thông tin từ ảnh'}</p><p className="ml-7 mt-1 text-xs leading-5 text-[var(--brand-muted)]">{qr ? 'Bạn có thể chỉnh sửa trước khi lưu.' : 'OCR có thể sai dấu. Hãy đối chiếu tên với ảnh.'}</p></> : <p className="text-xs leading-5 text-[var(--brand-muted)]">Ưu tiên đọc QR để giữ nguyên tên tiếng Việt có dấu.</p>}
          </div>
        </section>
        <section className="mt-6 md:mt-0">
          <h3 className="mb-4 text-lg font-bold text-[var(--brand-shell)]">Thông tin khách thuê</h3>
          <div className="space-y-4">
            <div><label className={labelClass} htmlFor="tenant-full-name">Họ và tên <span className="text-rose-500">*</span></label><input id="tenant-full-name" name="full_name" className={inputClass} placeholder="Tự điền từ ảnh CCCD" value={fullName} disabled={isPending} onChange={event => { setFullName(event.target.value); setReviewed(false); fieldsVersion.current++; draftEdited.current = true }} /></div>
            <div><label className={labelClass} htmlFor="tenant-identity-card">Số CCCD / CMND <span className="text-rose-500">*</span></label><input id="tenant-identity-card" name="identity_card" className={inputClass} placeholder="Số giấy tờ" inputMode="numeric" maxLength={12} value={identityCard} disabled={isPending} onChange={event => { setIdentityCard(event.target.value.replace(/\D/g, '')); setReviewed(false); fieldsVersion.current++; draftEdited.current = true }} /></div>
            <div><label className={labelClass} htmlFor="tenant-phone">Số điện thoại</label><input id="tenant-phone" name="phone" type="tel" className={inputClass} placeholder="Nhập số khách cung cấp" value={phone} disabled={isPending} onChange={event => setPhone(event.target.value)} /></div>
            <div><label className={labelClass} htmlFor="tenant-email">Email</label><input id="tenant-email" name="email" type="email" aria-invalid={Boolean(emailCheck.error)} aria-describedby="tenant-email-help" className={inputClass} placeholder="Nhập email khách cung cấp" value={email} disabled={isPending} onChange={event => setEmail(event.target.value)} /><p id="tenant-email-help" role="status" className={`mt-2 text-xs leading-5 ${emailCheck.error ? "text-rose-700" : "text-[var(--brand-muted)]"}`}>{emailCheck.error || (emailCheck.checking ? "Đang kiểm tra email…" : "Dùng email riêng của khách để đăng nhập và nhận thông báo.")}</p></div>
            <div><label className={labelClass} htmlFor="tenant-notes">Ghi chú <span className="font-normal text-[var(--brand-muted)]">(không bắt buộc)</span></label><textarea id="tenant-notes" name="notes" className={`${inputClass} resize-none`} placeholder="Biển số xe hoặc thông tin cần lưu ý" rows={2} value={notes} disabled={isPending} onChange={event => setNotes(event.target.value)} /></div>
            <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-[var(--brand-ink)]"><input type="checkbox" className="mt-1 accent-[var(--brand-primary)]" checked={reviewed} disabled={locked || conflict} onChange={event => setReviewed(event.target.checked)} />Tôi đã đối chiếu họ tên và số giấy tờ với ảnh CCCD.</label>
          </div>
        </section>
      </div>
      {(localError || error || conflict) && <div role="alert" className="mx-7 mb-4 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={18} className="mt-0.5 shrink-0" />{localError || error || 'Hai ảnh có số giấy tờ khác nhau. Hãy kiểm tra lại.'}</div>}
      <footer className="flex shrink-0 justify-end gap-3 border-t border-[var(--brand-border)] bg-[var(--brand-canvas)] px-7 py-4">
        <button type="button" disabled={locked} onClick={onClose} className="rounded-lg border border-[var(--brand-border)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--brand-muted)] hover:bg-emerald-50 disabled:opacity-40">Hủy</button>
        <button type="submit" disabled={locked || emailCheck.blocked || conflict || !reviewed || !hasFront || !hasBack || !qr} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40">{locked ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />}Lưu hồ sơ khách thuê</button>
      </footer>
    </form>
  </div>
}
