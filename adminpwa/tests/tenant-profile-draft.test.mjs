import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../src/renderer/src/lib/tenant-profile-draft.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' })
const { detectedIdentityDraft, tenantProfilePayload } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const existing = { full_name: 'Tên cũ', identity_card: '', identity_image_url: 'old-image', address: 'Địa chỉ cũ', id_card_issued_date: '2020-01-01', id_card_issued_place: 'Nơi cấp cũ', is_active: false }
const draft = { fullName: ' Nguyễn  Văn A ', identityCard: '', phone: '090 111 1222', email: '', notes: ' Ghi chú ' }
test('contact-only updates preserve original identity image and metadata byte-for-byte', () => {
  const data = tenantProfilePayload(draft, existing)
  for (const key of ['identity_image_url', 'address', 'id_card_issued_date', 'id_card_issued_place', 'is_active']) assert.equal(data[key], existing[key])
  assert.equal(data.full_name, 'Nguyễn Văn A'); assert.equal(data.phone, '0901111222'); assert.equal(data.notes, 'Ghi chú')
})
test('replacement uses only verified new metadata, not previous person details', () => {
  const data = tenantProfilePayload(draft, existing, { image: 'new-image', fields: { address: 'Địa chỉ mới', issuedDate: '2026-01-01' } })
  assert.equal(data.identity_image_url, 'new-image'); assert.equal(data.address, 'Địa chỉ mới'); assert.equal(data.id_card_issued_date, '2026-01-01'); assert.equal(data.id_card_issued_place, undefined)
  const incomplete = tenantProfilePayload(draft, existing, { image: 'new-image' })
  assert.equal(incomplete.address, ''); assert.equal(incomplete.id_card_issued_date, undefined)
})
test('OCR fills each untouched field independently', () => {
  const current = { fullName: 'Tên nhập tay', identityCard: '009876543210' }
  const fields = { fullName: 'Tên OCR', identityCard: '001234567890' }
  assert.deepEqual(detectedIdentityDraft(current, {fullName:'',identityCard:''}, { fullName: true, identityCard: false }, fields), { fullName: current.fullName, identityCard: fields.identityCard })
  assert.deepEqual(detectedIdentityDraft(current, {fullName:'',identityCard:''}, { fullName: false, identityCard: true }, fields), { fullName: fields.fullName, identityCard: current.identityCard })
})
test('late OCR cannot replace either manually edited field', () => {
  const current = { fullName: 'Tên nhập tay', identityCard: '009876543210' }
  assert.deepEqual(detectedIdentityDraft(current, {fullName:'',identityCard:''}, { fullName: true, identityCard: true }, {fullName:'Tên OCR',identityCard:'001234567890'}), current)
})
test('removing the scan restores original identity data when fields are untouched', () => {
  const baseline = { fullName: 'Tên cũ', identityCard: '009876543210' }
  assert.deepEqual(detectedIdentityDraft({fullName:'Tên OCR',identityCard:'001234567890'}, baseline, {fullName:false,identityCard:false}), baseline)
})
test('add and edit share the same form and enforce replacement guards', async () => {
  const form = await readFile(new URL('../src/renderer/src/components/TenantFormModal.tsx', import.meta.url),'utf8')
  const tab = await readFile(new URL('../src/renderer/src/components/TenantsTab.tsx', import.meta.url),'utf8')
  assert.match(tab, /<TenantFormModal\s+initialTenant=\{initialTenant\}/)
  assert.match(form, /replaceIdentity && \(!hasFront \|\| !hasBack\)/)
  assert.match(form, /replaceIdentity && !qr/); assert.match(form, /replaceIdentity && !reviewed/)
  assert.match(form, /qr\?\.fields\?\.identityCard !== identityCard\.trim\(\)/)
  assert.match(form, /if \(!editedFields\.current\.fullName\) setFullName/)
})
