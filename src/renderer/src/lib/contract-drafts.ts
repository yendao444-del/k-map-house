import { supabase, safeQuery } from './supabase'
import type { ContractDraft, ContractDraftSnapshot } from './contract-draft'
import { hasValidContractEmail } from './contract-draft'
import { assertTenantEmail } from './tenant-email'

export async function getContractDrafts(): Promise<ContractDraft[]> {
  const rows = await safeQuery(() => supabase.from('contract_drafts').select('*').eq('status', 'draft').order('updated_at', { ascending: false }))
  return (rows || []) as ContractDraft[]
}

export async function getContractDraftForRoom(roomId: string): Promise<ContractDraft | null> {
  const { data, error } = await supabase.from('contract_drafts').select('*').eq('room_id', roomId).eq('status', 'draft').maybeSingle()
  if (error) throw new Error(error.message)
  return data as ContractDraft | null
}

export async function saveContractDraft(snapshot: ContractDraftSnapshot, previous?: ContractDraft): Promise<ContractDraft> {
  if (!hasValidContractEmail(snapshot.tenant.email)) throw new Error('Bổ sung email hợp lệ trong hồ sơ khách thuê trước khi lập hợp đồng.')
  await assertTenantEmail(snapshot.tenant.email)
  const values = {
    room_id: snapshot.room.id, tenant_id: snapshot.tenant.id,
    recipient_email: snapshot.tenant.email?.trim() || '', snapshot,
    status: 'draft', updated_at: new Date().toISOString()
  }
  const response = previous
    ? await supabase.from('contract_drafts').update({ ...values, revision: previous.revision + 1 }).eq('id', previous.id).eq('status', 'draft').eq('revision', previous.revision).select().maybeSingle()
    : await supabase.from('contract_drafts').insert(values).select().single()
  if (response.error) {
    if (response.error.code === '23505') throw new Error('Phòng này đã có bản nháp. Mở bản nháp trong danh sách Hợp đồng để tiếp tục.')
    if (response.error.code === 'PGRST205') throw new Error('Chưa có bảng lưu bản nháp hợp đồng trên Supabase.')
    throw new Error(response.error.message)
  }
  if (!response.data) throw new Error('Bản nháp đã thay đổi ở nơi khác. Quay lại danh sách và mở bản mới nhất.')
  return response.data as ContractDraft
}

export async function cancelContractDraft(draft: ContractDraft): Promise<void> {
  const { data, error } = await supabase.from('contract_drafts').update({ status: 'cancelled', revision: draft.revision + 1, updated_at: new Date().toISOString() }).eq('id', draft.id).eq('status', 'draft').eq('revision', draft.revision).select('id').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Bản nháp đã thay đổi. Tải lại danh sách trước khi hủy.')
}
