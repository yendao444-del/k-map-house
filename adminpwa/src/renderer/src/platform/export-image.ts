import { toBlob } from 'html-to-image'

export async function invoiceImage(payload: { html: string; fileName: string }): Promise<File> {
  if (!payload.html || payload.html.length > 2_000_000) throw new Error('Nội dung hóa đơn không hợp lệ hoặc quá lớn.')
  // Generated invoice HTML is isolated from the app origin. Scripts, forms and
  // navigation cannot run in this sandbox, even if stored customer text is bad.
  const iframe = document.createElement('iframe')
  iframe.sandbox.add('allow-same-origin')
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:1600px;pointer-events:none;'
  iframe.srcdoc = payload.html.replace(/<head[^>]*>/i, '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: https:; style-src \'unsafe-inline\'; font-src data: https:; script-src \'none\'; connect-src \'none\'">')
  const loaded = new Promise<void>((resolve, reject) => {
    iframe.onload = () => resolve()
    iframe.onerror = () => reject(new Error('Không thể chuẩn bị ảnh hóa đơn.'))
  })
  document.body.append(iframe)
  try {
    await loaded
    const doc = iframe.contentDocument
    if (!doc?.body) throw new Error('Không thể đọc nội dung hóa đơn.')
    await doc.fonts.ready
    await Promise.all(Array.from(doc.images).map(img => img.decode().catch(() => undefined)))
    const target = (doc.querySelector('.invoice-wrap, .invoice-container, .invoice') || doc.body) as HTMLElement
    // A centered page's computed margin was cloned into the SVG, shifting the
    // paper outside its capture bounds. Render the complete paper at its own
    // dimensions, independent of the phone viewport and surrounding page.
    const width = Math.ceil(target.getBoundingClientRect().width)
    const height = Math.ceil(target.getBoundingClientRect().height)
    const blob = await toBlob(target, {
      width, height, pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true,
      style: { margin: '0', transform: 'none' }
    })
    if (!blob) throw new Error('Không thể tạo ảnh hóa đơn.')
    return new File([blob], payload.fileName.replace(/\.(?:jpe?g|png)$/i, '') + '.png', { type: 'image/png' })
  } finally { iframe.remove() }
}

export function downloadFile(file: Blob, name: string): void {
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name.replace(/[\\/:*?"<>|]/g, '-')
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function saveInvoiceImage(payload: { html: string; fileName: string }) {
  try {
    const file = await invoiceImage(payload)
    downloadFile(file, file.name)
    // A browser reports download initiation, not an inaccessible Windows path.
    return { ok: true }
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Không thể xuất ảnh hóa đơn.' } }
}
