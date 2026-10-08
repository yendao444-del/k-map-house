import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildContractDraftSnapshot, contractExpiration, previewContract, validateContractDraft } from '../src/renderer/src/lib/contract-draft.ts'

const room = { id: 'room-test', name: 'Phòng 999', floor: 1, base_rent: 3500000, status: 'vacant', created_at: '2026-10-05', tenant_name: 'Previous tenant', tenant_phone: 'previous-private-phone', old_debt: 900000 }
const tenant = { id: 'tenant-test', full_name: 'Đỗ Mỹ Duyên', identity_card: '001200000123', address: 'Hà Nội', id_card_issued_date: '2025-11-24', email: 'tenant@example.com', identity_image_url: 'private-image', is_active: true }
const form = { baseRent: 3500000, depositAmount: 3500000, moveInDate: '2026-10-05', durationMonths: 12, invoiceDay: 5, occupantCount: 1, electricInitial: '', waterInitial: '', readingEditReason: '', additionalTerms: 'Một thỏa thuận có dấu.' }

test('contract draft snapshot preserves identity, excludes photos/secrets and previous occupants', () => {
  const snapshot = buildContractDraftSnapshot(room, tenant, { sepay_api_token: 'secret', property_owner_name: 'Nguyễn An', opening_balance_bank: 999 }, form)
  const encoded = JSON.stringify(snapshot)
  for (const excluded of ['private-image', 'secret', 'Previous tenant', 'previous-private-phone', 'old_debt', 'opening_balance_bank']) assert.equal(encoded.includes(excluded), false, excluded)
  assert.equal(snapshot.tenant.full_name, 'Đỗ Mỹ Duyên')
  assert.equal(snapshot.tenant.identity_card, '001200000123')
  assert.equal(snapshot.form.electricInitial, '')
  assert.equal(snapshot.form.waterInitial, '')
  const contract = previewContract(snapshot, '2026-10-05T12:00:00Z')
  assert.equal(contract.tenant_id_card_issued_date, '2025-11-24')
  assert.equal(contract.tenant_dob, undefined)
  assert.equal(contract.notes, form.additionalTerms)
  assert.equal(contract.expiration_date, '2027-10-05')
})

test('contract dates clamp month ends and reject nonexistent dates', () => {
  assert.equal(contractExpiration('2026-01-31', 1), '2026-02-28')
  assert.equal(contractExpiration('2024-01-31', 1), '2024-02-29')
  assert.equal(contractExpiration('2026-10-05', 0), undefined)
  assert.equal(contractExpiration('2026-02-31', 1), undefined)
  assert.ok(validateContractDraft({ ...form, moveInDate: '2026-02-31' }, tenant))
})

test('draft accepts incomplete readings but rejects invalid financial values and inactive tenant', () => {
  assert.equal(validateContractDraft(form, tenant), null)
  for (const change of [{ baseRent: 0 }, { depositAmount: -1 }, { invoiceDay: 29 }, { electricInitial: -1 }, { waterInitial: 1.5 }, { durationMonths: -1 }, { occupantCount: 0 }]) assert.ok(validateContractDraft({ ...form, ...change }, tenant))
  assert.ok(validateContractDraft(form, { ...tenant, is_active: false }))
})
