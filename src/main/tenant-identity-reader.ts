import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import sharp from 'sharp'
import { readBarcodes, prepareZXingModule } from 'zxing-wasm/reader'
import { createWorker, PSM } from 'tesseract.js'
import { MAX_IDENTITY_IMAGE_BYTES, parseIdentityQr, parseIdentityOcr, type IdentityReadResult } from '../shared/tenant-identity'

const runtimeRequire = createRequire(typeof __filename === 'string' ? __filename : import.meta.url)
let zxingReady = false

export function decodeIdentityImage(dataUrl: unknown): Buffer {
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_IDENTITY_IMAGE_BYTES * 1.4 + 100) throw new Error('Ảnh CCCD vượt giới hạn 5 MB.')
  const match = dataUrl.match(/^data:image\/(?:jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/)
  if (!match) throw new Error('Vui lòng dùng ảnh JPG hoặc PNG.')
  const bytes = Buffer.from(match[1], 'base64')
  if (!bytes.length || bytes.length > MAX_IDENTITY_IMAGE_BYTES) throw new Error('Ảnh CCCD vượt giới hạn 5 MB.')
  return bytes
}

export async function readTenantIdentity(bytes: Buffer, languagePath: string): Promise<IdentityReadResult> {
  if (bytes.length > MAX_IDENTITY_IMAGE_BYTES) throw new Error('Ảnh CCCD vượt giới hạn 5 MB.')
  const image = sharp(bytes, { limitInputPixels: 24_000_000, failOn: 'error' }).rotate()
  const metadata = await image.metadata()
  if (!['jpeg', 'png'].includes(metadata.format || '')) throw new Error('Vui lòng dùng ảnh JPG hoặc PNG.')
  const normalized = await image.resize({ width: 2600, height: 2600, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
  if (!zxingReady) {
    await prepareZXingModule({ overrides: { wasmBinary: readFileSync(runtimeRequire.resolve('zxing-wasm/reader/zxing_reader.wasm')) }, fireImmediately: true })
    zxingReady = true
  }
  const { data, info } = await sharp(normalized).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const qrCodes = await readBarcodes({ data: new Uint8ClampedArray(data), width: info.width, height: info.height, colorSpace: 'srgb' }, {
    formats: ['QRCode'], tryHarder: true, tryRotate: true, tryInvert: true, tryDenoise: true, maxNumberOfSymbols: 4
  })
  const identities = qrCodes.map(code => parseIdentityQr(code.text)).filter(fields => fields !== null)
  if (new Set(identities.map(fields => fields.identityCard)).size > 1) return { ok: false, error: 'Ảnh có nhiều giấy tờ khác nhau. Hãy chọn ảnh của một khách thuê.' }
  if (identities[0]) return { ok: true, source: 'qr', fields: identities[0], needsReview: true }

  // Keep OCR models local. No card image or text is sent to a cloud service.
  const worker = await createWorker('vie+eng', 1, {
    langPath: languagePath, gzip: false, cacheMethod: 'none',
    workerPath: runtimeRequire.resolve('tesseract.js/src/worker-script/node/index.js'),
    corePath: join(runtimeRequire.resolve('tesseract.js-core/package.json'), '..'),
    errorHandler: () => undefined
  })
  const timeout = setTimeout(() => { void worker.terminate() }, 45000)
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
    // Large backgrounds and fingers confuse page segmentation. First read a
    // modestly sized image; keep this a generic transform, not fixture coordinates.
    const { data: result } = await worker.recognize(await sharp(normalized).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer())
    const fields = parseIdentityOcr(result.text)
    if (!fields.identityCard) {
      // A second pass on the middle/lower image helps handheld portrait photos.
      // Merge only a valid printed number; never replace the first pass's name.
      const meta = await sharp(normalized).metadata()
      const height = meta.height!, width = meta.width!
      const crop = await sharp(normalized).extract({ left: 0, top: Math.floor(height * 0.35), width, height: Math.floor(height * 0.55) }).resize({ width: 1800 }).normalize().toBuffer()
      const { data: second } = await worker.recognize(crop)
      const extra = parseIdentityOcr(second.text)
      if (extra.identityCard) fields.identityCard = extra.identityCard
      if (!fields.fullName) fields.fullName = extra.fullName
    }
    if (!fields.fullName && !fields.identityCard) return { ok: false, error: 'Chưa đọc rõ thông tin. Hãy thêm ảnh mặt sau có QR hoặc ảnh chụp gần, rõ hơn.' }
    return { ok: true, source: 'ocr', fields, needsReview: true }
  } finally {
    clearTimeout(timeout)
    await worker.terminate()
  }
}
