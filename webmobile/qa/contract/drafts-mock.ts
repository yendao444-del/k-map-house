import type { ContractDraft, ContractDraftSnapshot } from '../../../src/renderer/src/lib/contract-draft'
const key = 'isolated-contract-qa-drafts'
const rows = (): ContractDraft[] => JSON.parse(localStorage.getItem(key) || '[]')
const write = (drafts: ContractDraft[]) => localStorage.setItem(key,JSON.stringify(drafts))
export const getContractDrafts = async () => rows().filter(draft => draft.status === 'draft')
export const getContractDraftForRoom = async (id: string) => rows().find(draft => draft.room_id === id && draft.status === 'draft') || null
export async function saveContractDraft(snapshot: ContractDraftSnapshot,previous?: ContractDraft): Promise<ContractDraft> {
  const drafts = rows()
  if (previous && !drafts.some(draft => draft.id === previous.id && draft.revision === previous.revision)) throw new Error('Bản nháp đã thay đổi.')
  const draft: ContractDraft = {id:previous?.id || crypto.randomUUID(),room_id:snapshot.room.id,tenant_id:snapshot.tenant.id,recipient_email:snapshot.tenant.email || '',status:'draft',snapshot,revision:(previous?.revision || 0)+1,created_at:previous?.created_at || new Date().toISOString(),updated_at:new Date().toISOString()}
  write([...drafts.filter(row=>row.id!==draft.id),draft])
  return draft
}
export async function cancelContractDraft(target: ContractDraft): Promise<void> {
  write(rows().map(draft=>draft.id===target.id ? {...draft,status:'cancelled',revision:draft.revision+1} : draft))
}
