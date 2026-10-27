import { readBarcodes, prepareZXingModule } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { createWorker, PSM } from 'tesseract.js'
import { MAX_IDENTITY_IMAGE_BYTES, parseIdentityOcr, parseIdentityQr, type IdentityReadResult } from '../../../shared/tenant-identity'

let ready: Promise<unknown> | undefined
export async function readIdentity(dataUrl: string): Promise<IdentityReadResult> {
  if (!/^data:image\/(jpeg|png);base64,/.test(dataUrl) || dataUrl.length > MAX_IDENTITY_IMAGE_BYTES * 1.4 + 100) return { ok: false, error: 'Vui lòng dùng ảnh JPG/PNG dưới 5 MB.' }
  const blob = await (await fetch(dataUrl)).blob()
  if (blob.size > MAX_IDENTITY_IMAGE_BYTES) return { ok: false, error: 'Ảnh giấy tờ vượt giới hạn 5 MB.' }
  const image = await createImageBitmap(blob)
  if (image.width * image.height > 24_000_000) { image.close(); return { ok: false, error: 'Ảnh quá lớn. Hãy chọn ảnh có độ phân giải thấp hơn.' } }
  const scale = Math.min(1, 2600 / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height); image.close()
  ready ||= prepareZXingModule({ overrides: { locateFile: () => wasmUrl }, fireImmediately: true })
  await ready
  const codes = await readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), { formats: ['QRCode'], tryHarder: true, tryRotate: true, tryInvert: true, maxNumberOfSymbols: 4 })
  const identities = codes.map(code => parseIdentityQr(code.text)).filter(fields => fields !== null)
  if (new Set(identities.map(fields => fields.identityCard)).size > 1) return { ok: false, error: 'Ảnh có nhiều giấy tờ. Hãy chọn ảnh của một khách thuê.' }
  if (identities[0]) return { ok: true, source: 'qr', fields: identities[0], needsReview: true }
  // Models are served by this app; no identity image or text is sent off-device.
  const worker = await createWorker('vie+eng', 1, { langPath: '/ocr', workerPath: '/ocr/worker.min.js', corePath: '/ocr/core', gzip: false, cacheMethod: 'none' })
  const timer = window.setTimeout(() => { void worker.terminate() }, 45_000)
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
    const { data } = await worker.recognize(canvas)
    const fields = parseIdentityOcr(data.text)
    if (!fields.fullName && !fields.identityCard) return { ok: false, error: 'Chưa đọc rõ thông tin. Hãy dùng ảnh rõ hơn hoặc mặt sau có QR.' }
    return { ok: true, source: 'ocr', fields, needsReview: true }
  } finally { window.clearTimeout(timer); await worker.terminate() }
}

export async function readClipboardImage(): Promise<string | null> {
  if (!navigator.clipboard?.read) throw new Error('Thiết bị chưa hỗ trợ dán ảnh. Hãy dùng nút chọn ảnh hoặc chụp ảnh.')
  for (const item of await navigator.clipboard.read()) {
    const type = item.types.find(value => value === 'image/png' || value === 'image/jpeg')
    if (!type) continue
    const blob = await item.getType(type)
    if (blob.size > MAX_IDENTITY_IMAGE_BYTES) throw new Error('Ảnh giấy tờ vượt giới hạn 5 MB.')
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob) })
  }
  return null
}
