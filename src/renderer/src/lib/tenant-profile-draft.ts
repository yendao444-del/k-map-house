import { normalizeIdentityName, type IdentityFields } from '../../../shared/tenant-identity'
import type { Tenant } from './db'

type Draft = { fullName: string; identityCard: string; phone: string; email: string; notes: string }
export function detectedIdentityDraft(current: Pick<Draft, 'fullName' | 'identityCard'>, fallback: Pick<Draft, 'fullName' | 'identityCard'>, edited: { fullName: boolean; identityCard: boolean }, fields?: IdentityFields) {
  return {
    fullName: edited.fullName ? current.fullName : fields?.fullName || fallback.fullName,
    identityCard: edited.identityCard ? current.identityCard : fields?.identityCard || fallback.identityCard,
  }
}

export function tenantProfilePayload(draft: Draft, existing?: Tenant, replacement?: { image: string; fields?: IdentityFields }): Omit<Tenant, 'id' | 'created_at' | 'updated_at'> {
  return {
    full_name: normalizeIdentityName(draft.fullName), identity_card: draft.identityCard.trim(),
    phone: draft.phone.replace(/[\s.-]/g, ''), email: draft.email.trim(), notes: draft.notes.trim(),
    identity_image_url: replacement ? replacement.image : existing?.identity_image_url,
    address: replacement ? replacement.fields?.address || '' : existing?.address,
    id_card_issued_date: replacement ? replacement.fields?.issuedDate : existing?.id_card_issued_date,
    id_card_issued_place: replacement ? undefined : existing?.id_card_issued_place,
    is_active: existing?.is_active ?? true,
  }
}
