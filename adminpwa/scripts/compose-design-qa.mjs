import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = fileURLToPath(new URL('../', import.meta.url))
const reference = path.join(root, '../tmp-product-design/rooms-mobile-20261008/electron-like-revision.png')
const implementation = path.join(root, 'qa', process.argv[2] || 'rooms-390-initial.png')
const sourceMetadata = await sharp(reference).metadata()
const actualMetadata = await sharp(implementation).metadata()
const source = await sharp(reference).resize(390, 844, { fit: 'fill' }).png().toBuffer()
const actual = await sharp(implementation).resize(390, 844, { fit: 'fill' }).png().toBuffer()
const suffix = process.argv[3] || 'initial'
await sharp({ create: { width: 800, height: 844, channels: 4, background: '#cbd5e1' } }).composite([{ input: source, left: 0, top: 0 }, { input: actual, left: 410, top: 0 }]).png().toFile(path.join(root, `qa/rooms-comparison-${suffix}.png`))
const crop = { left: 0, top: 220, width: 390, height: 228 }
await sharp({ create: { width: 800, height: 228, channels: 4, background: '#cbd5e1' } }).composite([{ input: await sharp(source).extract(crop).png().toBuffer(), left: 0, top: 0 }, { input: await sharp(actual).extract(crop).png().toBuffer(), left: 410, top: 0 }]).png().toFile(path.join(root, `qa/rooms-focused-${suffix}.png`))
console.log(JSON.stringify({ sourcePixels: [sourceMetadata.width, sourceMetadata.height], actualPixels: [actualMetadata.width, actualMetadata.height], normalized: [390, 844], output: `qa/rooms-comparison-${suffix}.png` }))
