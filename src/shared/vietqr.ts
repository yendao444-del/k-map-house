import QRCode from 'qrcode'

// VietQR (NAPAS EMVCo) is generated locally from the SAME amount and transfer
// content that is printed on the invoice. Never load a QR image from a remote
// service: a cached/stale remote image once showed another room's QR.
export const VIETQR_BANK_BINS: Readonly<Record<string, string>> = Object.freeze({
  VCB: '970436',
  MBBANK: '970422',
  TCB: '970407',
  ACB: '970416',
  BIDV: '970418',
  VPB: '970432',
  TPB: '970423',
  AGRIBANK: '970405',
  SHB: '970443',
  OCB: '970448',
  MSB: '970426',
  VIB: '970441',
  HDB: '970437',
  SCB: '970429',
  SACOMBANK: '970403',
  EXIMBANK: '970431'
})

export type VietQrInput = { bankId: string; accountNo: string; amount: number; description: string }

const tlv = (id: string, value: string): string => {
  if (value.length > 99) throw new Error('Trường VietQR quá dài.')
  return `${id}${String(value.length).padStart(2, '0')}${value}`
}

export function crc16Ccitt(text: string): string {
  let crc = 0xffff
  for (let index = 0; index < text.length; index += 1) {
    crc ^= text.charCodeAt(index) << 8
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function buildVietQrPayload(input: VietQrInput): string {
  const bin = VIETQR_BANK_BINS[(input.bankId || '').trim().toUpperCase()]
  if (!bin) throw new Error('Ngân hàng nhận tiền chưa được hỗ trợ tạo VietQR.')
  const accountNo = (input.accountNo || '').replace(/\s+/g, '')
  if (!/^[A-Za-z0-9]{4,19}$/.test(accountNo)) throw new Error('Số tài khoản nhận tiền không hợp lệ.')
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 9_999_999_999) {
    throw new Error('Số tiền VietQR không hợp lệ.')
  }
  // Invoice codes are pure ASCII; reject anything a bank app could re-encode.
  if (!/^[A-Za-z0-9]{1,50}$/.test(input.description || '')) throw new Error('Nội dung chuyển khoản VietQR không hợp lệ.')
  const merchant = tlv('00', 'A000000727') + tlv('01', tlv('00', bin) + tlv('01', accountNo)) + tlv('02', 'QRIBFTTA')
  const body = tlv('00', '01') + tlv('01', '12') + tlv('38', merchant) + tlv('53', '704') +
    tlv('54', String(input.amount)) + tlv('58', 'VN') + tlv('62', tlv('08', input.description)) + '6304'
  return body + crc16Ccitt(body)
}

export function vietQrSvgDataUrl(input: VietQrInput): string {
  const qr = QRCode.create(buildVietQrPayload(input), { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const margin = 4
  let path = ''
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (qr.modules.get(row, col)) path += `M${col + margin} ${row + margin}h1v1h-1z`
    }
  }
  const dimension = size + margin * 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

// Rendering must never fail the whole invoice; callers show a warning instead.
export function tryVietQrSvgDataUrl(input: VietQrInput): string | null {
  try { return vietQrSvgDataUrl(input) } catch { return null }
}
