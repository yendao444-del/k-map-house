import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = new URL('../', import.meta.url)
const targets = [
  { name: 'existing-tenant', shot: 'public-existing', x: 27 },
  { name: 'new-tenant', shot: 'public-new', x: 502 },
  { name: 'capture-electric', shot: 'public-capture', x: 978 }
]
const preview = []
for (const item of targets) {
  const reference = await sharp(fileURLToPath(new URL('approved-option-1.png', root))).extract({ left: item.x, top: 48, width: 443, height: 1014 }).resize(393, 900, { fit: 'fill' }).png().toBuffer()
  const inputPath = fileURLToPath(new URL(`qa/home/${item.shot}.png`, root))
  const metadata = await sharp(inputPath).metadata()
  if (metadata.width !== 393 || metadata.height < 900) throw new Error(`Invalid mobile capture: ${item.shot} ${metadata.width}x${metadata.height}`)
  const implementation = await sharp(inputPath).extract({ left: 0, top: 0, width: 393, height: 900 }).png().toBuffer()
  await writeFile(new URL(`qa/home/reference-${item.name}.png`, root), reference)
  await writeFile(new URL(`qa/home/${item.name}.png`, root), implementation)
  const comparison = await sharp({ create: { width: 802, height: 900, channels: 3, background: '#fff' } }).composite([{ input: reference, left: 0, top: 0 }, { input: implementation, left: 409, top: 0 }]).png().toBuffer()
  await writeFile(new URL(`qa/home/compare-${item.name}.png`, root), comparison)
  preview.push({ input: implementation, left: preview.length * 417 + 16, top: 16 })
}
await writeFile(new URL('qa/home/mobile-demo-board.png', root), await sharp({ create: { width: 1251, height: 932, channels: 3, background: '#EAF1EC' } }).composite(preview).png().toBuffer())
console.log('Three normalized comparisons and demo board written.')
