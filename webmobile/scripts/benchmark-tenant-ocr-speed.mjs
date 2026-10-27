import assert from 'node:assert/strict'
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { privateConfig } from './private-config.mjs'
import { readCloudMeter } from '../cloud/online-reader.mjs'

const variantName = process.argv[2] || 'token-256'
const variants = {
  current: {},
  'token-256': { maxOutputTokens: 256 },
  'thinking-off-token-256': { maxOutputTokens: 256, thinkingBudget: 0 }
}
if (!Object.hasOwn(variants, variantName)) throw new Error('Use current, token-256, or thinking-off-token-256.')

const env = await privateConfig()
assert.ok(env.METER_CLOUD_API_KEY, 'Gemini key missing')
assert.equal(env.METER_CLOUD_PROVIDER, 'gemini')
const sourceDir = 'C:/Users/Admin/Downloads/dien nuoc/'
const files = (await readdir(sourceDir)).filter(file => /\.jpe?g$/i.test(file)).sort()
assert.ok(files.length >= 2, 'Need the supplied electricity and water photos.')

async function imageFor(file) {
  const bytes = await readFile(path.join(sourceDir, file))
  const normalized = await sharp(bytes).rotate().resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 95 }).toBuffer()
  return `data:image/jpeg;base64,${normalized.toString('base64')}`
}

const electric = await imageFor(files[0])
const water = await imageFor(files[1])
const cases = [
  { id: 'electric', image: electric, meter: 'electric', expected: 12692 },
  { id: 'water', image: water, meter: 'water', expected: 287 },
  { id: 'wrong-meter', image: electric, meter: 'water', expected: null }
]
const results = []
for (const item of cases) {
  const started = performance.now()
  try {
    const result = await readCloudMeter(item.image, item.meter, env, undefined, variants[variantName])
    const passed = item.expected == null ? !result.ok : result.ok && result.reading === item.expected
    results.push({ case: item.id, passed, elapsedMs: Math.round(performance.now() - started), reading: result.ok ? result.reading : null, rejected: !result.ok })
  } catch (cause) {
    results.push({ case: item.id, passed: false, elapsedMs: Math.round(performance.now() - started), error: cause instanceof Error ? `${cause.name}:${cause.message}` : 'unknown' })
  }
}
const report = { at: new Date().toISOString(), model: env.METER_CLOUD_MODEL, variant: variantName, tuning: variants[variantName], results }
await mkdir('qa', { recursive: true })
await writeFile('qa/tenant-ocr-speed-benchmark.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
if (results.some(result => !result.passed)) process.exitCode = 1
