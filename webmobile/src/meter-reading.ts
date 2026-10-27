import type { ReadingAssessment } from './meter-policy.mjs'
import { requestJson } from './request-json.mjs'
export type Meter = 'electric' | 'water'
export type ReadingSource = 'ai-ocr' | 'manual'
export type MeterReadResult = { ok: true; reading: number; digits: string; unit: string; source: 'ai-ocr'; needsConfirmation: true; assessment: ReadingAssessment; reviewToken: string | null } | { ok: false; reason: string; code?: string }
// This preserves the old 3.95 MB Base64 ceiling while sending JPEG bytes directly.
const MAX_UPLOAD_JPEG_BYTES = 2_962_482

async function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('image_encode_failed')
  return blob
}

export function parseManualReading(value: string): number | null {
  if (!/^\d{1,8}$/.test(value)) return null
  const reading = Number(value)
  return Number.isSafeInteger(reading) && reading >= 0 ? reading : null
}

export async function recognizeMeter(url: string, meter: Meter, contractId: string, signal: AbortSignal): Promise<MeterReadResult> {
  const image = new Image()
  image.src = url
  await image.decode()
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 50_000_000) return { ok: false, reason: 'Ảnh có độ phân giải quá lớn. Hãy chụp lại hoặc chọn ảnh nhỏ hơn.' }
  const scale = Math.min(1, 2560 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('image_decode_failed')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  let upload = await encodeJpeg(canvas, .95)
  if (upload.size > MAX_UPLOAD_JPEG_BYTES) upload = await encodeJpeg(canvas, .8)
  if (upload.size > MAX_UPLOAD_JPEG_BYTES) return { ok: false, reason: 'Ảnh quá lớn để đọc. Hãy chọn ảnh nhỏ hơn.' }
  const form = new FormData()
  form.set('meter', meter)
  form.set('contractId', contractId)
  form.set('image', upload, 'meter.jpg')
  const { response, data: result } = await requestJson('/api/meter-ocr', {
    method: 'POST', body: form, signal
  },22000)
  if ([401,403].includes(response.status)) window.dispatchEvent(new Event('webmobile:unauthorized'))
  if (!response.ok || !result) return { ok: false, reason: typeof result?.reason === 'string' ? result.reason : 'Dịch vụ đọc ảnh chưa sẵn sàng. Hãy thử lại; ảnh chưa qua kiểm tra nên chưa thể xác nhận.', code: result?.code === 'OCR_NOT_CONFIGURED' ? result.code : undefined }
  if (!result.ok) return { ok: false, reason: typeof result.reason === 'string' ? result.reason : 'Chưa đọc rõ. Hãy chụp lại.' }
  if (typeof result.digits !== 'string' || parseManualReading(result.digits) !== result.reading || result.unit !== (meter === 'electric' ? 'kWh' : 'm3') || result.source !== 'ai-ocr' || !['pass', 'retake', 'review'].includes(result.assessment?.status) || typeof result.assessment?.reason !== 'string' || (result.assessment.status === 'pass' && (typeof result.reviewToken !== 'string'||!result.reviewToken))) return { ok: false, reason: 'Kết quả đọc chưa hợp lệ. Hãy chụp lại.' }
  return { ...result, needsConfirmation: true }
}

// Room 999 uses this only to rehearse the screens without sending an image to AI.
export async function simulateMeterReading(meter: Meter, contractId: string, signal: AbortSignal): Promise<MeterReadResult> {
  const { response, data: result } = await requestJson('/api/meter-ocr', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'simulation', meter, contractId }), signal
  }, 15000)
  if (!response.ok || !result?.ok) return { ok: false, reason: typeof result?.reason === 'string' ? result.reason : 'Chưa tạo được chỉ số kiểm nghiệm.' }
  if (typeof result.digits !== 'string' || parseManualReading(result.digits) !== result.reading || result.unit !== (meter === 'electric' ? 'kWh' : 'm3') || result.source !== 'ai-ocr' || result.assessment?.status !== 'pass' || typeof result.assessment?.reason !== 'string' || typeof result.reviewToken !== 'string') return { ok: false, reason: 'Kết quả kiểm nghiệm chưa hợp lệ.' }
  return { ...result, needsConfirmation: true }
}

export async function checkMeterReading(reading: number, meter: Meter, contractId: string, reviewToken: string, source: ReadingSource, signal: AbortSignal): Promise<{ ok: boolean; reason: string; source?: ReadingSource; confirmationToken?: string }> {
  const { response, data: result } = await requestJson('/api/meter-ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'check', reading, meter, contractId, reviewToken, source }), signal },15000)
  if (response.status === 401) window.dispatchEvent(new Event('webmobile:unauthorized'))
  if (!response.ok || !result?.ok || result.assessment?.status !== 'pass' || !['ai-ocr', 'manual'].includes(result.source) || typeof result.confirmationToken !== 'string') return { ok: false, reason: typeof result?.reason === 'string' ? result.reason : 'Chỉ số chưa qua kiểm tra. Hãy chụp lại.' }
  return { ok: true, reason: '', source: result.source, confirmationToken: result.confirmationToken }
}

export async function checkManualMeterReading(reading:number,meter:Meter,contractId:string,cameraError:boolean,signal:AbortSignal):Promise<{ok:boolean;reason:string}> {
 const {response,data:result}=await requestJson('/api/meter-ocr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'manual',reading,meter,contractId,cameraError}),signal},15000)
 if([401,403].includes(response.status))window.dispatchEvent(new Event('webmobile:unauthorized'))
 if(!response.ok||!result?.ok||result.assessment?.status!=='pass'||result.source!=='manual'||typeof result.confirmationToken!=='string')return {ok:false,reason:result?.reason||'Chưa xác nhận được chỉ số thủ công.'}
 return {ok:true,reason:''}
}
