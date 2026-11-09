const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const ts = require('typescript')
const sharp = require('sharp')

function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  const module = { exports: {} }
  new Function('exports', 'require', 'module', code)(module.exports, require, module)
  return module.exports
}
const vietqr = load('src/shared/vietqr.ts')

async function decode(dataUrl) {
  const { readBarcodes } = await import(pathToFileURL(require.resolve('zxing-wasm/reader')).href)
  const svg = Buffer.from(dataUrl.replace('data:image/svg+xml;base64,', ''), 'base64')
  const png = await sharp(svg, { density: 600 }).png().toBuffer()
  const found = await readBarcodes(new Blob([png]), { formats: ['QRCode'], tryHarder: true })
  assert.equal(found.length, 1)
  return found[0].text
}

// Captured from the real SePay QR for the same transfer; must match byte for byte.
const SEPAY_ORACLE = '00020101021238540010A00000072701240006970418011096247Q3PE90208QRIBFTTA5303704540728530005802VN62280824P352T112026C7970WERM9O5U63049876'

test('payload equals the bank-verified SePay QR, including CRC', () => {
  assert.equal(vietqr.buildVietQrPayload({ bankId: 'BIDV', accountNo: '96247Q3PE9', amount: 2853000, description: 'P352T112026C7970WERM9O5U' }), SEPAY_ORACLE)
})

test('scanning the rendered QR returns exactly the printed amount and content', async () => {
  const input = { bankId: 'BIDV', accountNo: '96247Q3PE9', amount: 3306000, description: 'P331T112026C5901ACSJ0T4I' }
  const text = await decode(vietqr.vietQrSvgDataUrl(input))
  assert.equal(text, vietqr.buildVietQrPayload(input))
  assert.match(text, /54073306000/)
  assert.match(text, /0824P331T112026C5901ACSJ0T4I/)
})

test('unknown bank, bad account, amount or content never produce a QR', () => {
  const ok = { bankId: 'BIDV', accountNo: '96247Q3PE9', amount: 1000, description: 'P1T112026CABC' }
  for (const bad of [{ bankId: 'XYZ' }, { accountNo: '12 34-5' }, { amount: 0 }, { amount: 1.5 }, { amount: -5 }, { description: 'Phòng 1' }, { description: '' }]) {
    assert.throws(() => vietqr.buildVietQrPayload({ ...ok, ...bad }))
    assert.equal(vietqr.tryVietQrSvgDataUrl({ ...ok, ...bad }), null)
  }
})

test('invoice screens and exports never load a remote QR image', () => {
  for (const file of [
    'src/renderer/src/components/InvoiceDetailModal.tsx', 'src/renderer/src/components/InvoicesTab.tsx',
    'adminpwa/src/renderer/src/components/InvoiceDetailModal.tsx', 'adminpwa/src/renderer/src/lib/invoice-export.ts'
  ]) {
    const source = fs.readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /qr\.sepay\.vn|img\.vietqr\.io/, file)
    assert.match(source, /tryVietQrSvgDataUrl\(/, file)
  }
  assert.equal(fs.readFileSync('src/shared/vietqr.ts', 'utf8'), fs.readFileSync('adminpwa/src/shared/vietqr.ts', 'utf8'))
  assert.doesNotMatch(fs.readFileSync('src/main/index.ts', 'utf8'), /img-src[^;"]*qr\.sepay/)
})
