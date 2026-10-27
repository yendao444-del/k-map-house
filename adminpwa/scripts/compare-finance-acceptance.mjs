import sharp from 'sharp'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const qa = fileURLToPath(new URL('../qa/', import.meta.url))
for (const [name, source] of [['pnl', 'business-report-mobile-demo.png'], ['transactions', 'transactions-mobile-demo.png']]) {
  const capture = path.join(qa, `${name}-390-acceptance-production.png`)
  const meta = await sharp(capture).metadata()
  assert.equal(meta.width, 390)
  assert.equal(meta.height, 844)
  const panels = await Promise.all([source, path.basename(capture)].map(file => sharp(path.join(qa, file)).resize(390, 844).png().toBuffer()))
  await sharp({ create: { width: 792, height: 844, channels: 3, background: '#e2e8f0' } })
    .composite(panels.map((input, i) => ({ input, left: i * 402, top: 0 })))
    .png().toFile(path.join(qa, `${name}-comparison-acceptance.png`))
  const focused = await Promise.all(panels.map(input => sharp(input).extract({ left: 0, top: 100, width: 390, height: 510 }).png().toBuffer()))
  await sharp({ create: { width: 792, height: 510, channels: 3, background: '#e2e8f0' } })
    .composite(focused.map((input, i) => ({ input, left: i * 402, top: 0 })))
    .png().toFile(path.join(qa, `${name}-focused-acceptance.png`))
}
console.log('Acceptance comparisons saved; reference left, production right.')
