export function paymentBankFromEnv(env) {
  const name = env.WEBMOBILE_PAYMENT_BANK?.trim()
  const account = env.WEBMOBILE_PAYMENT_ACCOUNT?.trim()
  const rawOwner = env.WEBMOBILE_PAYMENT_OWNER?.trim()
  if (!name && !account && !rawOwner) return null
  if (name !== 'BIDV' || !/^[A-Za-z0-9]{6,30}$/.test(account || '') || !rawOwner) throw new Error('Invalid payment recipient configuration.')
  const normalized = rawOwner.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toUpperCase()
  return { name, account, owner: normalized === 'DO KIM NGAN' ? 'Đỗ Kim Ngân' : rawOwner }
}

export function invoicePropertyFromEnv(env) {
  return Object.fromEntries(Object.entries({ property_name: env.WEBMOBILE_PROPERTY_NAME, property_address: env.WEBMOBILE_PROPERTY_ADDRESS, owner_name: env.WEBMOBILE_PROPERTY_OWNER, owner_phone: env.WEBMOBILE_PROPERTY_PHONE }).filter(([, value]) => typeof value === 'string' && value.trim()).map(([key, value]) => [key, value.trim()]))
}

export async function fetchBankQr(bank, amount, content, fetcher = fetch) {
  const url = new URL('https://qr.sepay.vn/img')
  url.search = new URLSearchParams({ bank: bank.name, acc: bank.account, amount: String(amount), des: content }).toString()
  const response = await fetcher(url, { signal: AbortSignal.timeout(6000) })
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')) throw new Error('QR ngân hàng chưa phản hồi. Hãy thử lại sau.')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length > 200000 || bytes.length < 8 || ![137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)) throw new Error('QR ngân hàng không hợp lệ.')
  return `data:image/png;base64,${btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''))}`
}
