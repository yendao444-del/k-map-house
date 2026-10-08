import type { ContractDraft, ContractDraftSnapshot } from '../../../src/renderer/src/lib/contract-draft'
import { params, record } from './events'
let stored: ContractDraft | null = null
export const getContractDraftForRoom = async () => stored
export async function saveContractDraft(snapshot: ContractDraftSnapshot, previous?: ContractDraft): Promise<ContractDraft> {
  record('Bắt đầu lưu')
  await new Promise(resolve => setTimeout(resolve, 500))
  if (params.has('saveFail')) { record('Lưu thất bại'); throw new Error('Không lưu được bản nháp (QA)') }
  stored = { id: previous?.id || 'qa-draft', room_id: snapshot.room.id, tenant_id: snapshot.tenant.id, recipient_email: snapshot.tenant.email!, snapshot, revision: (previous?.revision || 0) + 1, status: 'draft', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  record(`Đã lưu phiên bản ${stored.revision}`)
  return stored
}
