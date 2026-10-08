import { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { cameraFrameRect } from './camera-framing.mjs'

export default function MeterCamera({ meterLabel, onPhoto, onCancel, onFile }: { meterLabel: string; onPhoto: (blob: Blob) => void; onCancel: () => void; onFile: () => void }) {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null)
  const guide = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)
  const [error, setError] = useState(''), [ready, setReady] = useState(false)
  const [shooting, setShooting] = useState(false)
  useEffect(() => {
    let cancelled = false
    mounted.current = true
    if (!navigator.mediaDevices?.getUserMedia) { setError('Trình duyệt chưa hỗ trợ camera ở địa chỉ này. Hãy chọn ảnh đã chụp.'); return }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false }).then(value => {
      if (cancelled) { value.getTracks().forEach(track => track.stop()); return }
      stream.current = value
      if (video.current) video.current.srcObject = value
    }).catch(() => { if (!cancelled) setError('Chưa mở được camera. Bạn có thể cấp quyền camera hoặc chọn ảnh đã chụp.') })
    return () => { cancelled = true; mounted.current = false; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null }
  }, [])
  async function shoot() {
    const source = video.current, frame = guide.current
    if (!source || !frame || !source.videoWidth || shooting) return
    setShooting(true)
    // Match the fixed guide to the original pixels, including object-fit: cover.
    const rect = cameraFrameRect(source.videoWidth, source.videoHeight, source.getBoundingClientRect(), frame.getBoundingClientRect())
    const canvas = document.createElement('canvas'); canvas.width = rect.width; canvas.height = rect.height
    const context = canvas.getContext('2d')
    if (!context) { setError('Chưa chụp được ảnh. Hãy thử lại.'); setShooting(false); return }
    context.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .97))
    if (!mounted.current) return
    if (blob) onPhoto(blob); else { setError('Chưa chụp được ảnh. Hãy thử lại.'); setShooting(false) }
  }
  return <section className="camera-screen"><h2>Chụp công tơ {meterLabel}</h2><p>Đưa trọn một mặt công tơ vào khung, giữ rõ dãy số rồi bấm chụp.</p><div className="camera-preview"><video ref={video} autoPlay playsInline muted onLoadedData={() => setReady(true)} /><div ref={guide} className="camera-guide"><span>Một công tơ · đủ mặt và dãy số</span></div></div><p>Hệ thống lấy ảnh trong khung và đọc số ngay.</p>{error && <p role="alert" className="error-message">{error}</p>}<button className="primary-button" disabled={!ready || shooting} onClick={shoot}><Camera />{shooting ? 'Đang lấy ảnh…' : 'Chụp & đọc số'}</button><button className="secondary-button" onClick={onFile}>Chọn ảnh đã chụp</button><button className="text-button" onClick={onCancel}>Quay lại</button></section>
}
