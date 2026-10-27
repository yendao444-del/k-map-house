import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const qa = fileURLToPath(new URL('../qa/', import.meta.url))
for (const [name, source, capture] of [
  ['pnl', 'business-report-mobile-demo.png', 'pnl-390-latest-production.jpg'],
  ['transactions', 'transactions-mobile-demo.png', 'transactions-390-latest-production.jpg']
]) {
  const images = await Promise.all([source, capture].map(file => sharp(path.join(qa, file)).resize(390, 844, { fit: 'fill' }).png().toBuffer()))
  await sharp({ create: { width: 792, height: 844, channels: 3, background: '#e2e8f0' } })
    .composite(images.map((input, index) => ({ input, left: index * 402, top: 0 })))
    .png().toFile(path.join(qa, `${name}-comparison-latest-production.png`))
  const crops = await Promise.all(images.map(input => sharp(input).extract({ left: 0, top: 100, width: 390, height: 510 }).png().toBuffer()))
  await sharp({ create: { width: 792, height: 510, channels: 3, background: '#e2e8f0' } })
    .composite(crops.map((input, index) => ({ input, left: index * 402, top: 0 })))
    .png().toFile(path.join(qa, `${name}-focused-latest-production.png`))
  for (const widths of [[320, 430], [768, 900, 1280]]) {
    const captures = await Promise.all(widths.map(width => sharp(path.join(qa, `${name}-${width}-latest-production.jpg`)).resize({ height: 600 }).png().toBuffer()))
    const sizes = await Promise.all(captures.map(input => sharp(input).metadata()))
    let left = 0
    const composite = captures.map((input, i) => { const item = { input, top: 0, left }; left += sizes[i].width + 12; return item })
    await sharp({ create: { width: left - 12, height: 600, channels: 3, background: '#e2e8f0' } })
      .composite(composite).png().toFile(path.join(qa, `${name}-responsive-${widths[0]}-latest.png`))
  }
}
console.log('Combined full, focused and responsive evidence saved under adminpwa/qa (source left, implementation right).')
