import { getCurrentAccessToken } from './db'
import type { ContractDraft } from './contract-draft'
import { validateContractReadings } from './contract-draft'
import { assertTenantEmail } from './tenant-email'
import { supabase } from './supabase'
export { contractEmailHtml } from '../../../shared/contract-email-template'

export type ConfirmationEvent = { id: string; type: string; at: string; historical?: boolean; attempt?: number; revision?: number; email?: string; reason?: string; actor?: string; beforeForm?: import('./contract-draft').ContractDraftForm; afterForm?: import('./contract-draft').ContractDraftForm }
type ConfirmationResponse = { ok: boolean; error?: string; url?: string; email?: string; confirmation?: { id: string; status: string; revision: number; expiresAt: string; sentAt?: string; viewedAt?: string; confirmedAt?: string }; room?: string; tenantName?: string }
const apiUrl = String(import.meta.env.VITE_CONTRACT_CONFIRMATION_API_URL || '').trim().replace(/\/$/, '')

async function lifecycle(action: string, contractId: string, reason?: string, details: Record<string, unknown> = {}) {
  if (!apiUrl) throw new Error('Chưa cấu hình backend hợp đồng.')
  const token = await getCurrentAccessToken()
  if (!token) throw new Error('Phiên Electron hết hạn. Đăng nhập lại.')
  const response = await fetch(`${apiUrl}/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, contractId, reason, ...details }), signal: AbortSignal.timeout(20000) })
  const data = await response.json()
  if (!response.ok || !data.ok) throw new Error(data.error || 'Chưa xử lý được hợp đồng.')
  return data
}
export const startContractAmendment = async (contractId: string, reason: string): Promise<ContractDraft> => (await lifecycle('amendment_start', contractId, reason)).draft
export type CancellationKind = 'wrong_tenant' | 'wrong_room' | 'wrong_email' | 'duplicate' | 'test_reset'
export type CancellationCheck = { allowed: boolean; isTestContract?: boolean; reason: string; invoices: number; receipts: number; cashTransactions: number; status: string; confirmedAt?: string; deadline?: string; usageEvidence?: number; notice?: { status: string; recipient: string; error?: string; attempted_at?: string } }
export const checkContractCancellation = async (contractId: string): Promise<CancellationCheck> => (await lifecycle('cancel_check', contractId)).check
export const cancelContractWithReason = async (contractId: string, reason: string, kind: CancellationKind, referenceId: string): Promise<void> => { await lifecycle('cancel', contractId, reason, { kind, referenceId }) }
export const getPendingCancellationNotices = async (): Promise<string[]> => (await lifecycle('cancel_notices', '')).contracts
export async function sendContractCancellationNotice(contractId: string): Promise<string> {
  const { cancellationEmailHtml, deliverCancellationNotice } = await import('../../../shared/contract-cancellation-email')
  return deliverCancellationNotice({
    claim: async () => (await lifecycle('cancel_notice', contractId, undefined, { noticeAction: 'claim' })).notice,
    send: notice => window.api.gmail.sendNotification({ to: notice.recipient, subject: `AN KHANG HOME · Thông báo hủy hợp đồng phòng ${notice.room_name}`, html: cancellationEmailHtml(notice) }),
    mark: (notice, outcome, messageId, error) => lifecycle('cancel_notice', contractId, undefined, { noticeAction: outcome, attemptId: notice.attempt_id, messageId, error })
  })
}
export const getContractHistory = async (contractId: string): Promise<ConfirmationEvent[]> => (await lifecycle('contract_history', contractId)).events

export const contractConfirmationConfigured = (): boolean => Boolean(apiUrl)
export type ContractAccountReadiness = { contractId: string; tenantId: string; status: 'pending' | 'ready' | 'locked'; reason?: string }
export async function getContractAccountReadiness(): Promise<ContractAccountReadiness[]> {
  const { data, error } = await supabase.rpc('contract_account_readiness')
  if (error || !Array.isArray(data)) throw new Error('Chưa kiểm tra được trạng thái tài khoản khách thuê.')
  return data
}
export async function getContractConfirmationAvailability(): Promise<{ ready: boolean; reason: string }> {
  if (!apiUrl) return { ready: false, reason: 'Chưa cấu hình dịch vụ xác nhận hợp đồng cho Electron.' }
  try {
    const response = await fetch(`${apiUrl}/availability`, { method: 'POST', headers: { Authorization: `Bearer ${await getCurrentAccessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'availability' }), signal: AbortSignal.timeout(12000) })
    const data = await response.json()
    return { ready: Boolean(response.ok && data.ok && data.ready), reason: data.error || 'Dịch vụ xác nhận hợp đồng đã sẵn sàng.' }
  } catch { return { ready: false, reason: 'Chưa kết nối được dịch vụ xác nhận hợp đồng.' } }
}
export async function getContractConfirmationStatus(draftId: string): Promise<ConfirmationResponse['confirmation']> {
  if (!apiUrl) return undefined
  const response = await fetch(`${apiUrl}/status`, { method: 'POST', headers: { Authorization: `Bearer ${await getCurrentAccessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', draftId }), signal: AbortSignal.timeout(12000) })
  const data = await response.json()
  if (!response.ok || !data.ok) throw new Error(data.error || 'Chưa kiểm tra được trạng thái gửi.')
  return data.confirmation
}
export async function getContractConfirmationHistory(draftId: string): Promise<ConfirmationEvent[]> {
  if (!apiUrl) return []
  const response = await fetch(`${apiUrl}/history`, { method: 'POST', headers: { Authorization: `Bearer ${await getCurrentAccessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'history', draftId }), signal: AbortSignal.timeout(12000) })
  const data = await response.json()
  if (!response.ok || !data.ok) throw new Error(data.error || 'Chưa tải được lịch sử xác nhận.')
  return Array.isArray(data.events) ? data.events : []
}
export async function createContractConfirmation(draft: ContractDraft): Promise<ConfirmationResponse> {
  const readingError = validateContractReadings(draft.snapshot.form)
  if (readingError) throw new Error(readingError)
  await assertTenantEmail(draft.recipient_email)
  if (!apiUrl) throw new Error('Chưa cấu hình dịch vụ xác nhận hợp đồng.')
  const token = await getCurrentAccessToken()
  if (!token) throw new Error('Phiên Electron đã hết hạn. Hãy đăng nhập lại.')
  const response = await fetch(`${apiUrl}/create`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', draftId: draft.id, revision: draft.revision }), signal: AbortSignal.timeout(20000) })
  const data = await response.json().catch(() => ({})) as ConfirmationResponse
  if (!response.ok || !data.ok || !data.url || !data.confirmation?.id) throw new Error(data.error || 'Chưa tạo được link xác nhận hợp đồng.')
  return data
}
export async function markContractConfirmationDelivery(draftId: string, confirmationId: string, messageId?: string, failed = false): Promise<void> {
  if (!apiUrl) throw new Error('Backend xác nhận chưa được cấu hình.')
  const token = await getCurrentAccessToken()
  if (!token) throw new Error('Gmail đã xử lý nhưng phiên Electron hết hạn. Kiểm tra hộp thư trước khi gửi lại.')
  const response = await fetch(`${apiUrl}/delivery`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delivery', draftId, confirmationId, messageId, failed }), signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error('Gmail đã xử lý nhưng chưa lưu được trạng thái. Kiểm tra hộp thư trước khi gửi lại.')
}
