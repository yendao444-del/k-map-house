// Persist the existing local gateway connection for launches outside Codex.
// Never print credentials or use VITE_* keys here.
import { readFile, writeFile } from 'node:fs/promises'
const file = new URL('../.env.local', import.meta.url)
if (!process.env.NINEROUTER_URL || !process.env.NINEROUTER_KEY) throw new Error('Local gateway configuration is missing.')
let content = await readFile(file, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error })
const config = { METER_OCR_BASE_URL: process.env.NINEROUTER_URL, METER_OCR_API_KEY: process.env.NINEROUTER_KEY, METER_OCR_MODEL: 'cx/gpt-6.1-sol' }
for (const [key, value] of Object.entries(config)) {
  if (/[\r\n]/.test(value)) throw new Error('Invalid local gateway configuration.')
  const line = `${key}=${JSON.stringify(value)}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  content = pattern.test(content) ? content.replace(pattern, () => line) : `${content.trimEnd()}\n${line}\n`
}
await writeFile(file, content, { mode: 0o600 })
console.log('OCR local configured in ignored .env.local. No credentials printed.')
