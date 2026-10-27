import { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { cameraFrameRect } from './camera-framing.mjs'
import { startCameraPreview } from './camera-preview.mjs'

type Props = { meterLabel: string; onPhoto: (blob: Blob) => void; onCancel: () => void; onCameraError?: () => void; onManual?: () => void }
export default function MeterCamera({ meterLabel, onPhoto, onCancel, onCameraError, onManual }: Props) {
  const preview = useRef<HTMLCanvasElement>(null), guide = useRef<HTMLDivElement>(null), nativeInput = useRef<HTMLInputElement>(null)
  const camera = useRef<ReturnType<typeof startCameraPreview> | null>(null)
  const failureCallback = useRef(onCameraError)
  failureCallback.current = onCameraError
  const mounted = useRef(false), capturing = useRef(false), nativeVersion = useRef(0)
  const [ready, setReady] = useState(false), [fallback, setFallback] = useState(false), [shooting, setShooting] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    mounted.current = true
    const controller = startCameraPreview({ canvas: preview.current!, onReady: setReady, onFailure: () => {
      if (!mounted.current) return
      setFallback(true); setError('Camera trong trang chưa mở được. Bạn có thể chụp bằng camera điện thoại.'); failureCallback.current?.()
    } })
    camera.current = controller
    return () => { mounted.current = false; controller.stop(); camera.current = null }
  }, [])
  function openNative() {
    camera.current?.stop(); setReady(false); setFallback(true)
    // Opening the picker must happen directly in this user gesture.
    nativeInput.current?.click()
  }
  async function nativePhoto(file?: File) {
    const version = ++nativeVersion.current
    if (!file) return
    if (file.size > 10 * 1024 * 1024 || (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))) {
      setError('Ảnh tối đa 10 MB. Hãy chụp lại ảnh công tơ.'); failureCallback.current?.(); return
    }
    const url = URL.createObjectURL(file)
    try {
      const image = new Image(); image.src = url; await image.decode()
      if (!mounted.current || version !== nativeVersion.current) return
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 50_000_000) throw new Error('invalid_image')
      onPhoto(file)
    } catch { if (mounted.current && version === nativeVersion.current) { setError('Trình duyệt chưa đọc được ảnh này. Hãy chụp lại hoặc nhập chỉ số thủ công.'); failureCallback.current?.() } }
    finally { URL.revokeObjectURL(url) }
  }
  async function shoot() {
    const controller = camera.current, surface = preview.current, frame = guide.current
    if (!controller?.isReady() || !surface || !frame || capturing.current) return
    capturing.current = true; setShooting(true); setError('')
    try {
      const source = controller.source
      // Preserve full-resolution capture; canvas is only the preview.
      const rect = cameraFrameRect(source.videoWidth, source.videoHeight, surface.getBoundingClientRect(), frame.getBoundingClientRect())
      const canvas = document.createElement('canvas'); canvas.width = rect.width; canvas.height = rect.height
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('capture_failed')
      ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .97))
      if (!mounted.current) return
      if (!blob) throw new Error('capture_failed')
      controller.stop(); onPhoto(blob)
    } catch { if (mounted.current) { camera.current?.stop(); setReady(false); setFallback(true); setError('Chưa chụp được ảnh. Hãy dùng camera điện thoại.'); failureCallback.current?.() } }
    finally { capturing.current = false; if (mounted.current) setShooting(false) }
  }
  return <section className="camera-screen">
    <input ref={nativeInput} hidden type="file" accept="image/*" capture="environment" aria-label={`Ảnh từ camera điện thoại · ${meterLabel}`} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void nativePhoto(file) }} />
    <div className="camera-copy"><h2>Chụp công tơ {meterLabel}</h2><p>Đưa máy lại gần, căn công tơ và dãy số rõ trong khung.</p></div>
    <div className={`camera-preview ${fallback ? 'camera-fallback' : ''}`}><canvas ref={preview} role="img" aria-label={`Hình camera công tơ ${meterLabel}`} /><div ref={guide} className="camera-guide"><span>Căn trọn dãy số trong khung</span></div>{!ready && <p className="camera-status" role="status">{fallback ? 'Dùng camera điện thoại để tiếp tục' : 'Đang mở camera…'}</p>}</div>
    {error && <p role="alert" className="error-message">{error}</p>}
    <div className="camera-actions"><button className="primary-button" disabled={shooting || (!ready && !fallback)} onClick={fallback ? openNative : () => void shoot()}><Camera />{shooting ? 'Đang chụp…' : fallback ? 'Mở camera điện thoại' : 'Chụp ảnh'}</button>{!fallback && <button className="text-button" onClick={openNative}>Dùng camera điện thoại</button>}{fallback && onManual && <button className="text-button" onClick={onManual}>Nhập chỉ số thủ công</button>}<button className="text-button" onClick={onCancel}>Quay lại</button></div>
  </section>
}
