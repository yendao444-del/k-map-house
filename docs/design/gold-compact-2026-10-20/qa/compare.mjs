import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
const path = relative => fileURLToPath(new URL(relative, import.meta.url))
const source = path('../split.png')
const stage = process.argv[2] || 'initial'
const current = path(`./desktop-${stage}.png`)
const { width, height } = await sharp(current).metadata()
const reference = await sharp(source).resize(width, height, { fit: 'fill' }).png().toBuffer()
await sharp(reference).toFile(path('./reference-normalized.png'))
// Exclude unchanged application titlebar: preview has an explicitly labelled fixture header.
const sourceCrop = await sharp(reference).extract({ left: 0, top: 56, width, height: height - 56 }).png().toBuffer()
const implementation = await sharp(current).extract({ left: 0, top: 56, width, height: height - 56 }).png().toBuffer()
await sharp({ create: { width: width * 2, height: height - 56, channels: 4, background: '#ffffff' } }).composite([
  { input: sourceCrop, left: 0, top: 0 }, { input: implementation, left: width, top: 0 }
]).png().toFile(path(`./comparison-${stage}.png`))
// Focused quote, chart controls and tabs, proportionally scaled to the same CSS viewport.
for (const [name, region] of Object.entries({
  quotes: { left: 244, top: 166, width: 540, height: 551 },
  tabs: { left: 244, top: 660, width: 1440, height: 249 }
})) {
  const a = await sharp(reference).extract(region).png().toBuffer()
  const b = await sharp(current).extract(region).png().toBuffer()
  await sharp({ create: { width: region.width * 2, height: region.height, channels: 4, background: '#fff' } }).composite([
    { input: a, left: 0, top: 0 }, { input: b, left: region.width, top: 0 }
  ]).png().toFile(path(`./${name}-${stage}.png`))
}
console.log(`Compared ${stage}: source normalized to ${width}x${height}; unchanged app header excluded.`)
