import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

const at = name => fileURLToPath(new URL(name, import.meta.url))
const reference = await sharp(at('identity.png')).resize(1419, 718).png().toBuffer()
const current = await sharp(at('qa/content.jpg')).png().toBuffer()
await sharp(reference).toFile(at('qa/reference-normalized.png'))
await sharp({ create: { width: 1419, height: 1456, channels: 3, background: '#fff' } })
  .composite([{ input: reference, left: 0, top: 0 }, { input: current, left: 0, top: 738 }]).png().toFile(at('qa/comparison.png'))
const sourceDetail = await sharp(reference).extract({ left: 200, top: 175, width: 580, height: 490 }).png().toBuffer()
const currentDetail = await sharp(current).extract({ left: 200, top: 185, width: 580, height: 490 }).png().toBuffer()
await sharp({ create: { width: 1180, height: 490, channels: 3, background: '#fff' } })
  .composite([{ input: sourceDetail, left: 0, top: 0 }, { input: currentDetail, left: 600, top: 0 }]).png().toFile(at('qa/comparison-detail.png'))
console.log('Comparison saved: source above/left, implementation below/right')
