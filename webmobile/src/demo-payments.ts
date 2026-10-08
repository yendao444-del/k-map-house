export type InvoiceFields = {
  invoice_number: string; invoice_date: string; due_date: string; billing_period_start: string; billing_period_end: string
  billing_reason: string; is_first_month: boolean; room_id: string; tenant_id: string; contract_id: string
  tenant_phone: string; tenant_email: string; property_name: string; property_address: string; owner_name: string; owner_phone: string
  electric_old: number | null; electric_new: number; electric_usage: number | null; electric_cost: number; electric_price_snapshot: number
  water_old: number | null; water_new: number; water_usage: number | null; water_cost: number; water_price_snapshot: number
  room_cost: number; wifi_cost: number; garbage_cost: number; old_debt: number; adjustment_amount: number; adjustment_note: string
  deposit_amount: number; deposit_applied: number; damage_amount: number; total_amount: number; paid_amount: number
  payment_status: 'paid' | 'unpaid'; payment_date: string | null; payment_method: 'transfer' | null
  payment_records: { id: string; amount: number; payment_method: 'transfer'; payment_date: string; created_at: string; external_ref: string; external_id: string; source: string; note: string }[]
  amount_in_words: string; note: string; created_at: string
}
export type DemoInvoice = {
  id: string; contractId: string; room: string; tenantName: string; month: number; year: number
  status: 'pending' | 'review' | 'paid'; total: number; paid: number; remaining: number
  transferContent: string; qr: string; demo: true; notice: string
  qrKind?: 'bank' | 'demo'
  bank: { name: string; account: string; owner: string }
  details: InvoiceFields
  lines: { label: string; detail: string; amount: number }[]
  readings: Record<'electric' | 'water', { old: number | null; new: number; source: 'manual' | 'ai-ocr' }>
  receipt: { id: string; transactionRef: string; date: string; amount: number } | null
}
export type DemoPayment = { invoice: DemoInvoice; accessToken: string }
export type DemoScenario = 'exact' | 'partial' | 'over' | 'wrong-code' | 'duplicate'
export class DemoPaymentError extends Error { constructor(message: string, public status: number) { super(message) } }

async function request(data: object, signal?: AbortSignal) {
  const response = await fetch('/api/demo-payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) })
  const result = await response.json().catch(() => null)
  if (response.status === 401) window.dispatchEvent(new Event('webmobile:unauthorized'))
  if (!response.ok || !result?.ok) throw new DemoPaymentError(result?.reason || 'Backend demo chưa phản hồi. Hãy thử lại sau.', response.status)
  if (result.invoice && (!result.invoice.demo || !['pending', 'review', 'paid'].includes(result.invoice.status) || !Number.isSafeInteger(result.invoice.total) || result.invoice.total < 0 || !result.invoice.details?.invoice_number || result.invoice.details.total_amount !== result.invoice.total || !String(result.invoice.qr).startsWith('data:image/png;base64,'))) throw new Error('Hóa đơn demo chưa hợp lệ.')
  return result
}
export async function createDemoInvoice(contractId: string, electricToken: string, waterToken: string, signal: AbortSignal): Promise<DemoPayment> {
  const result = await request({ action: 'create', contractId, electricToken, waterToken }, signal)
  return { invoice: result.invoice, accessToken: result.accessToken }
}
export async function getDemoInvoice(payment: DemoPayment, signal: AbortSignal): Promise<DemoInvoice> {
  const result = await request({ action: 'status', id: payment.invoice.id, accessToken: payment.accessToken }, signal)
  if (result.invoice.contractId !== payment.invoice.contractId) throw new Error('Hóa đơn không thuộc hợp đồng hiện tại.')
  return result.invoice
}
export async function simulateDemoPayment(payment: DemoPayment, scenario: DemoScenario): Promise<void> {
  await request({ action: 'simulate', id: payment.invoice.id, accessToken: payment.accessToken, scenario })
}
