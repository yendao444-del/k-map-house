export type VerifiedTransaction = { id: string; reference_number: string | null; amount_in: number; transaction_content: string; transaction_date: string; account_number: string }
export class PaymentValidationError extends Error { constructor(message: string, public status = 422) { super(message) } }
export const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,128}$/.test(value)
// SePay account numbers can be numeric or alphanumeric virtual sub-accounts.
// Normalize formatting separators and compare a canonical upper-case key.
const normalizeAccount = (value: unknown) =>
  typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
export function verifyProviderTransaction(value: Record<string, unknown>, requestId: string, configuredAccount: string, now = Date.now()): VerifiedTransaction {
  const id = String(value.id ?? '')
  if (!identifier(id) || id !== requestId) throw new PaymentValidationError('Nguồn SePay không trả đúng mã giao dịch.')
  const amount = Number(value.amount_in)
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2147483647 || !['string','number'].includes(typeof value.amount_in) || Number(value.amount_out || 0) !== 0) throw new PaymentValidationError('Chỉ đối soát tiền VND thực nhận vào ngân hàng.')
  const account = normalizeAccount(configuredAccount)
  if (!account || ![normalizeAccount(value.account_number), normalizeAccount(value.sub_account)].includes(account)) throw new PaymentValidationError('Giao dịch không thuộc tài khoản nhận tiền đã cấu hình.')
  const rawDate = typeof value.transaction_date === 'string' ? value.transaction_date : ''
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?$/.test(rawDate)) throw new PaymentValidationError('Ngày giao dịch ngân hàng không hợp lệ.')
  const date = rawDate.replace(' ', 'T') + (/(Z|[+-]\d{2}:\d{2})$/.test(rawDate) ? '' : '+07:00')
  const dateParts = rawDate.slice(0,10)
  const at = Date.parse(date)
  const checkDay = new Date(`${dateParts}T00:00:00Z`)
  if (!Number.isFinite(at) || !Number.isFinite(checkDay.getTime()) || checkDay.toISOString().slice(0,10) !== dateParts || at > now + 300000) throw new PaymentValidationError('Ngày giao dịch ngân hàng không hợp lệ hoặc ở tương lai.')
  const content = typeof value.transaction_content === 'string' ? value.transaction_content : ''
  const ref = value.reference_number == null || value.reference_number === '' ? null : value.reference_number
  if (content.length > 4000 || (ref !== null && (typeof ref !== 'string' || ref.length > 128 || !/[a-z0-9]/i.test(ref)))) throw new PaymentValidationError('Nội dung đối soát vượt giới hạn hoặc không hợp lệ.')
  return { id, reference_number: ref as string | null, amount_in: amount, transaction_content: content, transaction_date: new Date(at).toISOString(), account_number: account }
}
