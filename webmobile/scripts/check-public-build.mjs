import { readdir, readFile } from 'node:fs/promises'
const directory = process.argv[2] || 'dist'
if (!['dist','dist-contract-test'].includes(directory)) throw new Error('Unknown public build directory.')
const root = new URL(`../${directory}/`, import.meta.url)
const allowed = /\.(html|js|css|woff2|webp|png)$|^favicon\.ico$|^_headers$/
const privateSecrets = [process.env.NINEROUTER_KEY, process.env.METER_OCR_API_KEY, process.env.METER_CLOUD_API_KEY, process.env.WEBMOBILE_GATEWAY_SECRET]
for (const file of ['../../.env', '../.env', '../.env.local', '../.env.production.local', '../.env.contract-test.local']) {
  try {
    for (const line of (await readFile(new URL(file, import.meta.url), 'utf8')).split(/\r?\n/)) {
      const match = line.match(/^(?:METER_CLOUD_API_KEY|CONTRACT_GATEWAY_SECRET|CONTRACT_TEST_ADMIN_PASSWORD|WEBMOBILE_GATEWAY_SECRET|NINEROUTER_KEY|METER_OCR_API_KEY|SUPABASE_SERVICE_ROLE_KEY|CLOUDFLARE_API_TOKEN|SUPABASE_ACCESS_TOKEN)\s*=\s*(.*)$/)
      if (match) privateSecrets.push(match[1].trim().replace(/^['"]|['"]$/g, ''))
    }
  } catch (cause) { if (cause.code !== 'ENOENT') throw cause }
}
async function walk(url) {
  for (const item of await readdir(url, { withFileTypes: true })) {
    const child = new URL(item.name + (item.isDirectory() ? '/' : ''), url)
    if (item.isDirectory()) { await walk(child); continue }
    if (!allowed.test(item.name)) throw new Error(`Unexpected file in public build: ${item.name}`)
    if (/\.(html|js|css)$/.test(item.name)) {
      const text = await readFile(child, 'utf8')
      if (/CLOUDFLARE_API_TOKEN|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN|GMAIL_REFRESH_TOKEN|METER_OCR_API_KEY|METER_CLOUD_API_KEY|WEBMOBILE_GATEWAY_SECRET|NINEROUTER_KEY|wtrycmiojsiliyjxsewz/.test(text)) throw new Error('Private server configuration detected in build.')
      for (const secret of privateSecrets.filter(value => value && value.length >= 8)) {
        if (text.includes(secret)) throw new Error('OCR provider credential detected in public build.')
      }
    }
  }
}
await walk(root)
for (const file of ['index.html', '_headers', 'favicon.ico', 'favicon-32.png', 'favicon-192.png', 'apple-touch-icon.png', 'assets/brand-white.png', 'assets/meter-electric.webp', 'assets/meter-water.webp']) await readFile(new URL(file, root))
console.log('Public build passed: static assets only, no private configuration.')
