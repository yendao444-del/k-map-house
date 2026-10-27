import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

export type NativeMeterHandle = { open: () => void }
type Props = { label: string; onPhoto: (blob: Blob) => void; onFailure: (message: string) => void }

// The phone owns the camera UI. No getUserMedia or video player is opened.
export default forwardRef<NativeMeterHandle, Props>(function NativeMeterInput({ label, onPhoto, onFailure }, ref) {
  const input = useRef<HTMLInputElement>(null), alive = useRef(false), version = useRef(0), pickerActive = useRef(false)
  const callbacks = useRef({ onPhoto, onFailure }); callbacks.current = { onPhoto, onFailure }
  useEffect(() => {
    alive.current = true
    const canceled = () => {
      if (!pickerActive.current) return
      pickerActive.current = false; version.current++; callbacks.current.onFailure('Chưa nhận được ảnh. Hãy thử chụp lại.')
    }
    const field = input.current!; field.addEventListener('cancel', canceled)
    return () => { alive.current = false; version.current++; field.removeEventListener('cancel', canceled) }
  }, [])
  useImperativeHandle(ref, () => ({ open() {
    pickerActive.current = true
    try { input.current?.click() } catch { pickerActive.current = false; callbacks.current.onFailure('Chưa mở được camera điện thoại. Hãy thử lại.') }
  } }), [])
  async function accept(file?: File) {
    const current = ++version.current
    pickerActive.current = false
    if (!file) { callbacks.current.onFailure('Chưa nhận được ảnh. Hãy thử chụp lại.'); return }
    if (file.size > 10 * 1024 * 1024 || (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))) {
      callbacks.current.onFailure('Ảnh tối đa 10 MB. Hãy chụp lại công tơ.'); return
    }
    const url = URL.createObjectURL(file)
    try {
      const image = new Image(); image.src = url; await image.decode()
      if (!alive.current || current !== version.current) return
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 50_000_000) throw new Error('invalid_image')
      callbacks.current.onPhoto(file)
    } catch { if (alive.current && current === version.current) callbacks.current.onFailure('Chưa đọc được ảnh này. Hãy chụp lại công tơ.') }
    finally { URL.revokeObjectURL(url) }
  }
  return <input ref={input} hidden type="file" accept="image/*" capture="environment" aria-label={`Chụp công tơ ${label}`} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void accept(file) }} />
})
