import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'

const publicDir = new URL('../public/', import.meta.url)
// Reuse the existing header logo's AK mark so browser icons match the brand.
const mark = await sharp(await readFile(new URL('assets/brand-white.png', publicDir)))
  .extract({ left: 10, top: 15, width: 190, height: 88 })
  .png().toBuffer()
async function icon(size) {
  const width = Math.round(size * 0.86)
  const resized = await sharp(mark).resize({ width }).png().toBuffer()
  const { height } = await sharp(resized).metadata()
  return sharp({ create: { width: size, height: size, channels: 4, background: '#064A31' } })
    .composite([{ input: resized, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) }])
    .png().toBuffer()
}
for (const [name, size] of [['favicon-32.png', 32], ['favicon-192.png', 192], ['apple-touch-icon.png', 180]]) {
  await writeFile(new URL(name, publicDir), await icon(size))
}
const sizes = [16, 32, 48]
const images = await Promise.all(sizes.map(icon))
const directory = Buffer.alloc(6 + 16 * sizes.length)
directory.writeUInt16LE(1, 2)
directory.writeUInt16LE(sizes.length, 4)
let offset = directory.length
images.forEach((image, i) => {
  const entry = 6 + i * 16
  directory[entry] = sizes[i]
  directory[entry + 1] = sizes[i]
  directory.writeUInt16LE(1, entry + 4)
  directory.writeUInt16LE(32, entry + 6)
  directory.writeUInt32LE(image.length, entry + 8)
  directory.writeUInt32LE(offset, entry + 12)
  offset += image.length
})
await writeFile(new URL('favicon.ico', publicDir), Buffer.concat([directory, ...images]))
console.log('Generated browser and mobile icons from the existing AK logo.')
