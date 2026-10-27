const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n').trim()

test('Electron edit uses the same OCR form as add, not the legacy narrow modal', () => {
  const source = read('src/renderer/src/components/TenantsTab.tsx')
  const edit = source.slice(source.indexOf('const TenantEditModal ='), source.indexOf('const TenantDetailModal ='))
  assert.match(edit, /<TenantFormModal\s+initialTenant=\{initialTenant\}/)
  assert.match(edit, /updateTenant\(initialTenant\.id, updates\)/)
  assert.match(edit, /onError:/)
  assert.doesNotMatch(edit, /max-w-md|tenant-edit-title|handleFileChange/)
})
for (const file of ['components/TenantFormModal.tsx', 'components/TenantIdentityPreview.tsx', 'lib/tenant-profile-draft.ts']) {
  test(`Electron and PWA are synchronized: ${file}`, () => {
    assert.equal(read(`src/renderer/src/${file}`), read(`adminpwa/src/renderer/src/${file}`))
  })
}
test('Electron edit keeps OCR validation, image zoom and contact-only legacy support', () => {
  const source = read('src/renderer/src/components/TenantFormModal.tsx')
  assert.match(source, /max-w-\[1040px\]/)
  assert.match(source, /Cập nhật ảnh CCCD/)
  assert.match(source, /unchangedLegacyIdentity/)
  assert.match(source, /replaceIdentity && !qr/)
  assert.match(source, /replaceIdentity && !reviewed/)
  assert.match(source, /data-identity-viewer/)
  assert.match(source, /Phóng to ảnh/)
})
