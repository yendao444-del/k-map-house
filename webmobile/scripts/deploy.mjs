import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const project = 'ankhanghome-payment'
const verifyOnly = process.argv.includes('--verify-only')
// Use the Windows trust store for HTTPS verification; never bypass certificate checks.
const env = { ...process.env, NODE_USE_SYSTEM_CA: '1' }
for (const file of [path.join(root, '..', '.env'), path.join(root, '.env.local')]) {
  try {
    for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
      const match = line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
      if (match) { const value = match[2].trim().replace(/^['"]|['"]$/g, ''); if (value) env[match[1]] = value }
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error }
}
if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required in private env files.')
function run(cmd, args, childEnv = process.env) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd: root, env: childEnv, stdio: 'inherit', shell: false, windowsHide: true })
    proc.on('error', reject); proc.on('exit', code => code === 0 ? resolve() : reject(new Error(`Command exited ${code}`)))
  })
}
const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
if (!verifyOnly) await run(process.execPath, [npmCli, 'run', 'build'], env)
const api = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects`
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000) })
  const data = await response.json()
  if (!data.success && response.status !== 404) throw new Error(`Cloudflare HTTP ${response.status}: ${JSON.stringify(data.errors?.map(x => ({ code: x.code, message: x.message })))}`)
  return { status: response.status, data }
}
const existing = await request(`${api}/${project}`)
if (existing.status === 404 || !existing.data.success) {
  if (verifyOnly) throw new Error('Pages project not found; verification does not create projects.')
  await request(api, { method: 'POST', body: JSON.stringify({ name: project, production_branch: 'main' }) })
  console.log(`Created separate Pages project: ${project}`)
} else console.log(`Deploying to ${project}; unrelated projects are untouched.`)
if (!verifyOnly) await run(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'pages', 'deploy', 'dist', '--project-name', project, '--branch', 'main', '--commit-dirty=true'], {
  ...env, CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID, WRANGLER_SEND_METRICS: 'false'
})
const url = `https://${project}.pages.dev`
const localHtml = await readFile(path.join(root, 'dist/index.html'), 'utf8')
const script = localHtml.match(/src="([^" ]+\.js)"/)?.[1]
if (!script) throw new Error('Missing build entry asset.')
const domainResponse = await request(`${api}/${project}/domains`)
if (!domainResponse.data.success) throw new Error('Could not verify custom domain state.')
const domains = domainResponse.data.result.map(item => ({ name: item.name, status: item.status, validation: item.validation_data?.status }))
const targets = [url, ...domains.filter(item => item.status === 'active').map(item => `https://${item.name}`)]
const verified = []
for (const target of targets) {
  let evidence
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await fetch(`${target}/?deployment-check=${Date.now()}`, { signal: AbortSignal.timeout(30000) })
    const html = await response.text()
    if (response.ok && html.includes('AN KHANG HOME') && html.includes(script)) {
      const asset = await fetch(new URL(script, target), { signal: AbortSignal.timeout(30000) })
      if (asset.ok && asset.headers.get('content-type')?.includes('javascript')) { evidence = { url: target, httpStatus: response.status, entryAsset: script, assetStatus: asset.status }; break }
    }
    if (attempt < 9) await new Promise(resolve => setTimeout(resolve, 3000))
  }
  if (!evidence) throw new Error(`Latest deployed build not verified at ${target}.`)
  verified.push(evidence)
  console.log(`Verified latest demo: ${target}`)
}
let health
// Pages can serve the new static bundle before its function bindings propagate.
for (let attempt = 0; attempt < 10; attempt++) {
  const healthResponse = await fetch(`${targets[0]}/api/health?deployment-check=${Date.now()}`, { signal: AbortSignal.timeout(30000) })
  health = await healthResponse.json().catch(() => null)
  if (health?.ok && health.backend === 'online') break
  if (attempt < 9) await new Promise(resolve => setTimeout(resolve, 3000))
}
if (!health?.ok || health.backend !== 'online') throw new Error('Online backend health verification failed.')
await writeFile(path.join(root, 'deployment.json'), JSON.stringify({ project, url, primaryUrl: 'https://pay.phongtroankhang.com', customDomains: domains, verified, backend: health, deployedAt: new Date().toISOString(), httpStatus: 200, mode: 'production-contract-confirmation-and-isolated-payment-demo', note: `Production contract confirmation and tenant account activation on pay.phongtroankhang.com. Supabase login supports Electron-provisioned tenants and isolated demo accounts. Real tenants see only their profile/current room; real invoices, OCR submission and SePay settlement are not connected. Email recovery awaits configuration.` }, null, 2) + '\n')
