import { readdir, readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { readMeterImage } from '../server/meter-reader.mjs'
const dir = 'C:/Users/Admin/Downloads/dien nuoc/'
const files = (await readdir(dir)).filter(x => /\.jpg$/i.test(x)).sort()
const headers = process.env.NINEROUTER_KEY ? { Authorization: `Bearer ${process.env.NINEROUTER_KEY}` } : {}
const catalog = await (await fetch(`${process.env.NINEROUTER_URL}/v1/models`, { headers })).json()
const model = process.env.METER_OCR_MODEL || 'cx/gpt-6.1-sol'
if (!catalog.data.some(item => item.id === model)) throw new Error('Configured OCR model is absent from catalog.')
for (const [index, file] of files.entries()) {
  const buffer = await sharp(await readFile(dir + file)).rotate().resize({ width: 1800, height: 1800, fit: 'inside' }).jpeg({ quality: 90 }).toBuffer()
  const result = await readMeterImage(`data:image/jpeg;base64,${buffer.toString('base64')}`, index === 0 ? 'electric' : 'water', { baseUrl: process.env.NINEROUTER_URL, apiKey: process.env.NINEROUTER_KEY, model })
  console.log(JSON.stringify({ meter: index === 0 ? 'electric' : 'water', model, ...result }))
}
