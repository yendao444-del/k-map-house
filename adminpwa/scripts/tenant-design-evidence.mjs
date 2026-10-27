import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
const target = 'C:/Users/Admin/.codex/visualizations/2026/09/22/01a0c6f6-7c6a-7db1-9b7d-ff16718b7143/tenant-edit-ocr-2026-10-10/tenant-edit-ocr-1.png'
const qa = resolve('qa/tenant-edit')
await mkdir(qa, { recursive: true })
const front = await sharp(target).extract({ left: 264, top: 377, width: 203, height: 136 }).png().toBuffer()
const back = await sharp(target).extract({ left: 505, top: 378, width: 197, height: 135 }).png().toBuffer()
await sharp(front).toFile(resolve(qa, 'front-demo.png'))
await sharp(back).toFile(resolve(qa, 'back-demo.png'))
const fronts = await sharp(front).resize(400, 270, { fit: 'contain', background: '#fff' }).png().toBuffer()
const backs = await sharp(back).resize(400, 270, { fit: 'contain', background: '#fff' }).png().toBuffer()
await sharp({ create: { width: 800, height: 270, channels: 3, background: '#fff' } }).composite([{ input: fronts, left: 0, top: 0 }, { input: backs, left: 400, top: 0 }]).png().toFile(resolve('src/renderer/src/qa/tenant-demo-strip.png'))
