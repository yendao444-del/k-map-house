import type { ContractDraft } from '../../../src/renderer/src/lib/contract-draft'
import { record } from './events'
export { contractEmailHtml } from '../../../src/shared/contract-email-template'
let confirmation: { id: string; status: string; revision: number; expiresAt: string } | undefined
export const getContractConfirmationAvailability = async () => ({ ready: true, reason: 'Dịch vụ xác nhận hợp đồng đã sẵn sàng.' })
export const getContractConfirmationStatus = async () => confirmation
export const getContractConfirmationHistory = async () => []
export const getContractHistory = async () => []
export async function createContractConfirmation(draft: ContractDraft) {
  record(`Tạo link phiên bản ${draft.revision}`)
  confirmation = { id: 'qa-confirmation', status: 'prepared', revision: draft.revision, expiresAt: '2026-12-31T00:00:00Z' }
  return { ok: true, email: draft.recipient_email, url: 'https://example.com/isolated-confirmation', confirmation }
}
export async function markContractConfirmationDelivery(draftId: string, id: string, _messageId?: string, failed?: boolean) {
  if (!confirmation || confirmation.id !== id || draftId !== 'qa-draft') throw new Error('Wrong persisted draft')
  confirmation.status = failed ? 'failed' : 'sent'
  record(failed ? 'Ghi nhận gửi thất bại' : `Ghi nhận đã gửi phiên bản ${confirmation.revision}`)
}
