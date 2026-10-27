const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const esbuild = require('esbuild')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n').trim()
const loadIdentityCell = photos => {
  const source = esbuild.transformSync(read('src/renderer/src/components/TenantIdentityListCell.tsx'), { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code
  const module = { exports: {} }
  vm.runInNewContext(source, { module, exports: module.exports, require: name => name === './TenantIdentityPreview' ? { useTenantIdentityPhotos: () => ({ photos, loading: false }) } : require(name) })
  return module.exports
}

for (const name of ['TenantIdentityListCell', 'TenantContactCell']) {
  test(`${name} stays synchronized in Electron and PWA`, () => assert.equal(read(`src/renderer/src/components/${name}.tsx`), read(`adminpwa/src/renderer/src/components/${name}.tsx`)))
}
for (const prefix of ['src/renderer/src', 'adminpwa/src/renderer/src']) {
  test(`${prefix}: list shows identity photos, real contact values and missing fields`, () => {
    const source = read(`${prefix}/components/TenantsTab.tsx`)
    assert.match(source, /Giấy tờ định danh/)
    assert.match(source, /<TenantIdentityListCell source=\{tenant.identity_image_url\}/)
    assert.match(source, /identity_card \|\| latestContract\?\.tenant_id_card/)
    assert.match(source, /<TenantContactCell phone=\{contactPhone\} email=\{tenant.email\}/)
    assert.match(source, /identityStates\[tenant.id\]\?\.incomplete/)
    assert.match(source, /t.email\?\.toLowerCase\(\).includes\(normalizedSearch\)/)
    assert.match(source, /colSpan=\{8\}/)
  })
}
test('Identity viewer uses real photos in a portal and supports bounded zoom plus keyboard dismissal', () => {
  const source = read('src/renderer/src/components/TenantIdentityListCell.tsx')
  assert.match(source, /useTenantIdentityPhotos\(source\)/)
  assert.match(source, /createPortal\(/)
  assert.match(source, /document.body/)
  assert.match(source, /aria-modal="true"/)
  assert.match(source, /event.key === 'Escape'/)
  assert.match(source, /event.key === 'Tab'/)
  assert.match(source, /previousFocus\?\.focus\(\)/)
  assert.match(source, /Math.min\(3, scale \+ 0.5\)/)
  assert.match(source, /Math.max\(1, scale - 0.5\)/)
  assert.match(source, /disabled=\{!photos\[side\]\}/)
  assert.match(source, /photos.front && photos.back && hasNumber/)
  assert.match(source, /Không tải được ảnh/)
})

test('Fullscreen viewer fits portrait/landscape without distortion and bounds wheel zoom', () => {
  const { fitTenantIdentityImage, wheelTenantIdentityScale } = loadIdentityCell({})
  assert.deepEqual(JSON.parse(JSON.stringify(fitTenantIdentityImage({ width: 600, height: 1200 }, { width: 1200, height: 600 }))), { width: 300, height: 600 })
  assert.deepEqual(JSON.parse(JSON.stringify(fitTenantIdentityImage({ width: 1200, height: 600 }, { width: 1200, height: 600 }))), { width: 1200, height: 600 })
  assert.ok(wheelTenantIdentityScale(1, -100) > 1)
  assert.ok(wheelTenantIdentityScale(2, 100) < 2)
  assert.equal(wheelTenantIdentityScale(3, -100), 3)
  assert.equal(wheelTenantIdentityScale(1, 100), 1)
  const source = read('src/renderer/src/components/TenantIdentityListCell.tsx')
  assert.match(source, /flex h-full w-full flex-col/)
  assert.match(source, /'electron' in window/)
  assert.match(source, /top: isElectronViewer \? '40px' : 0/)
  assert.match(source, /naturalWidth/)
  assert.match(source, /naturalHeight/)
  assert.match(source, /passive: false/)
  assert.match(source, /event.preventDefault\(\)/)
  assert.match(source, /ResizeObserver/)
})

test('Viewer dismissal stays outside Electron controls and supports blank-space click', () => {
  const source = read('src/renderer/src/components/TenantIdentityListCell.tsx')
  assert.match(source, /fixed inset-x-0 bottom-0/)
  assert.match(source, /top: isElectronViewer \? '40px' : 0/)
  assert.match(source, /event.target === event.currentTarget.firstElementChild/)
  assert.match(source, /aria-label="Đóng trình xem ảnh"/)
  assert.match(source, /app-no-drag/)
  assert.match(source, /onClick=\{event => event.stopPropagation\(\)\}/)
})
test('Contact values are not ellipsized and both absence states remain visible', () => {
  const source = read('src/renderer/src/components/TenantContactCell.tsx')
  assert.match(source, /Chưa có SĐT/)
  assert.match(source, /Chưa có email/)
  assert.match(source, /mailto:/)
  assert.match(source, /tel:/)
  assert.match(source, /break-all/)
  assert.doesNotMatch(source, /truncate|max-w-\[120px\]/)
})

test('Hover preview is desktop-only, non-interactive, bounded and dismisses on leave/click/scroll', () => {
  const source = read('src/renderer/src/components/TenantIdentityListCell.tsx')
  assert.match(source, /matchMedia\('\(hover: hover\)'\)/)
  assert.match(source, /if \(!photos\[side\] \|\| !supportsDesktopHover\(\)\) return/)
  assert.match(source, /onMouseEnter=/)
  assert.match(source, /onMouseLeave=\{\(\) => setHoverPreview\(null\)\}/)
  assert.match(source, /event.stopPropagation\(\); setHoverPreview\(null\)/)
  assert.match(source, /pointer-events-none fixed/)
  assert.match(source, /Math.min\(520,/)
  assert.match(source, /viewportWidth - width - 8/)
  assert.match(source, /viewportHeight - height - 8/)
  assert.match(source, /addEventListener\('scroll', dismiss, true\)/)
  assert.match(source, /removeEventListener\('scroll', dismiss, true\)/)
  assert.match(source, /addEventListener\('resize', dismiss\)/)
})

test('Larger hover preview is 520px on desktop and stays within narrow/short viewports', () => {
  const { getTenantHoverPreviewLayout } = loadIdentityCell({})
  const rect = { left: 252, top: 327, width: 68, bottom: 371 }
  const large = getTenantHoverPreviewLayout(rect, 1280, 720)
  assert.equal(large.width, 520)
  assert.ok(large.left >= rect.left + rect.width + 14, 'use the free side when it cannot fit above/below')
  for (const [viewportWidth, viewportHeight] of [[1280, 720], [768, 600], [390, 844], [320, 360], [1280, 300]]) {
    for (const anchor of [rect, { left: viewportWidth - 76, top: viewportHeight - 52, width: 68, bottom: viewportHeight - 8 }]) {
      const layout = getTenantHoverPreviewLayout(anchor, viewportWidth, viewportHeight)
      assert.ok(layout.left >= 8 && layout.top >= 8)
      assert.ok(layout.left + layout.width <= viewportWidth - 8)
      assert.ok(layout.top + layout.imageHeight + 54 <= viewportHeight - 8)
    }
  }
})

test('DEV list fixture stops mutations before reaching database functions', async () => {
  const { QueryClient, MutationCache } = require('@tanstack/react-query')
  const fixture = read('adminpwa/src/renderer/src/qa/TenantVisualHarness.tsx')
  assert.match(fixture, /mutationCache: new MutationCache\(\{ onMutate: \(\) => \{ throw new Error/)
  let writes = 0
  const client = new QueryClient({ mutationCache: new MutationCache({ onMutate: () => { throw new Error('QA read only') } }) })
  const mutation = client.getMutationCache().build(client, { mutationFn: async () => { writes++; return true } })
  await assert.rejects(mutation.execute(), /QA read only/)
  assert.equal(writes, 0)
})

for (const [title, photos, number, expected, complete] of [
  ['missing all identity data', {}, '', 'Chưa có CCCD', false],
  ['number alone is not a complete document', {}, '079123456789', 'Thiếu ảnh CCCD', false],
  ['front alone is not two photos', { front: '/front.png' }, '079123456789', 'Thiếu mặt sau', false],
  ['two photos still require a number', { front: '/front.png', back: '/back.png' }, '', 'Có 2 ảnh · thiếu số', false],
  ['complete document requires number and both photos', { front: '/front.png', back: '/back.png' }, '079123456789', 'Đủ 2 ảnh', true],
  ['broken source is not a complete document', { error: true }, '079123456789', 'Không tải được ảnh', false],
]) {
  test(title, () => {
    const { TenantIdentityListCell, maskTenantIdentity } = loadIdentityCell(photos)
    const html = renderToStaticMarkup(React.createElement(TenantIdentityListCell, { source: '/identity.png', identityNumber: number }))
    assert.ok(html.includes(expected))
    assert.equal(html.includes('text-emerald-700'), complete)
    if (number) { assert.ok(html.includes(maskTenantIdentity(number))); assert.ok(!html.includes(number)) }
  })
}
