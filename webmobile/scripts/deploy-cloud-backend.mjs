import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import ts from 'typescript'
const root = fileURLToPath(new URL('../', import.meta.url))
const privateFile = path.join(root, '.env.production.local')
const env = { ...process.env }
for (const file of [path.join(root, '..', '.env'), path.join(root, '.env'), path.join(root, '.env.local'), privateFile]) {
  try {
    for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/)
      if (match) { const value = match[2].trim().replace(/^['"]|['"]$/g, ''); if (value) env[match[1]] = value }
    }
  } catch (cause) { if (cause.code !== 'ENOENT') throw cause }
}
if (!env.SUPABASE_ACCESS_TOKEN || !env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) throw new Error('Missing private deployment credentials.')
if (!env.WEBMOBILE_GATEWAY_SECRET) {
  env.WEBMOBILE_GATEWAY_SECRET = randomBytes(32).toString('hex')
  await writeFile(privateFile, (await readFile(privateFile, 'utf8')) + `\nWEBMOBILE_GATEWAY_SECRET=${env.WEBMOBILE_GATEWAY_SECRET}\n`)
}
const sbUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const ref = new URL(sbUrl).hostname.split('.')[0]
const slug = 'webmobile-demo'
async function api(url, token, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }, signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`Deployment API HTTP ${response.status} at ${new URL(url).pathname}.`)
  const text = await response.text()
  return text ? JSON.parse(text) : null
}
const sb = (suffix, options) => api(`https://api.supabase.com/v1/projects/${ref}${suffix}`, env.SUPABASE_ACCESS_TOKEN, options)
const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
if (env.METER_CLOUD_API_KEY) {
  const gemini = (env.METER_CLOUD_PROVIDER || 'gemini') === 'gemini'
  const catalogUrl = gemini ? 'https://generativelanguage.googleapis.com/v1beta/models' : `${env.METER_CLOUD_BASE_URL?.replace(/\/$/, '')}/models`
  if (new URL(catalogUrl).protocol !== 'https:') throw new Error('Cloud provider requires HTTPS.')
  const catalog = await api(catalogUrl, gemini ? '' : env.METER_CLOUD_API_KEY, { headers: gemini ? { 'x-goog-api-key': env.METER_CLOUD_API_KEY } : {} })
  const model = env.METER_CLOUD_MODEL || 'gemini-3.1-flash-lite'
  const found = gemini ? catalog.models?.some(item => item.name === `models/${model}` && item.supportedGenerationMethods?.includes('generateContent')) : catalog.data?.some(item => item.id === model)
  if (!found) throw new Error('Selected cloud model not found in the current provider catalog. Update the private model setting before enabling OCR.')
  console.log('Cloud provider catalog and configured model verified; no credential printed.')
}
const schema = await readFile(path.join(root, 'cloud/schema.sql'), 'utf8')
await sb('/database/query', json({ query: schema }))
const authSchema = await readFile(path.join(root, 'cloud/auth-schema.sql'), 'utf8')
await sb('/database/query', json({ query: authSchema }))
await sb('/database/query', json({ query: await readFile(path.join(root, 'cloud/tenant-accounts-schema.sql'), 'utf8') }))
console.log('Created isolated demo state and atomic quota/lease functions; production business tables untouched.')

const [paymentSettings] = await sb('/database/query', json({ query: 'select bank_id, account_no, account_name, property_name, property_address, property_owner_name, property_owner_phone from public.app_settings limit 1' }))
if (paymentSettings?.bank_id !== 'BIDV' || !paymentSettings.account_no || !paymentSettings.account_name) throw new Error('Electron payment settings are missing or do not use BIDV.')

const secrets = [{ name: 'WEBMOBILE_GATEWAY_SECRET', value: env.WEBMOBILE_GATEWAY_SECRET }, { name: 'WEBMOBILE_AUTH_REQUIRED', value: 'true' }, { name: 'WEBMOBILE_CLOUD_PROVIDER', value: env.METER_CLOUD_PROVIDER || 'gemini' }, { name: 'WEBMOBILE_CLOUD_MODEL', value: env.METER_CLOUD_MODEL || 'gemini-3.1-flash-lite' }]
secrets.push({ name: 'WEBMOBILE_PAYMENT_BANK', value: paymentSettings.bank_id }, { name: 'WEBMOBILE_PAYMENT_ACCOUNT', value: paymentSettings.account_no }, { name: 'WEBMOBILE_PAYMENT_OWNER', value: paymentSettings.account_name })
for (const [name, key] of [['WEBMOBILE_PROPERTY_NAME', 'property_name'], ['WEBMOBILE_PROPERTY_ADDRESS', 'property_address'], ['WEBMOBILE_PROPERTY_OWNER', 'property_owner_name'], ['WEBMOBILE_PROPERTY_PHONE', 'property_owner_phone']]) if (paymentSettings[key]) secrets.push({ name, value: paymentSettings[key] })
if (env.METER_CLOUD_API_KEY) secrets.push({ name: 'WEBMOBILE_CLOUD_API_KEY', value: env.METER_CLOUD_API_KEY })
if (env.METER_CLOUD_BASE_URL) secrets.push({ name: 'WEBMOBILE_CLOUD_BASE_URL', value: env.METER_CLOUD_BASE_URL })
await sb('/secrets', json(secrets))
console.log(`Configured backend secrets without printing values. Local cloud AI key present: ${!!env.METER_CLOUD_API_KEY}`)

const transferSource = await readFile(path.join(root, '../src/renderer/src/lib/invoiceTransfer.ts'), 'utf8')
const modal = await readFile(path.join(root, '../src/renderer/src/components/InvoiceDetailModal.tsx'), 'utf8')
const ast = ts.createSourceFile('InvoiceDetailModal.tsx', modal, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX)
const words = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'numberToWords')
if (!words) throw new Error('Missing Electron numberToWords helper.')
const helper = ts.transpileModule(`${transferSource}\nexport ${words.getText(ast)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
if (/\b(?:import|require)\s*(?:\(|['"{*])/.test(helper)) throw new Error('Electron helpers must remain pure.')
const bundle = await build({ entryPoints: [path.join(root, 'cloud/edge.mjs')], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022', external: ['node:*'], plugins: [{
  name: 'pure-electron-helpers-and-deno-packages', setup(plugin) {
    plugin.onResolve({ filter: /^\.\/electron-transfer-adapter\.mjs$/ }, () => ({ path: 'electron-pure', namespace: 'pure' }))
    plugin.onLoad({ filter: /.*/, namespace: 'pure' }, () => ({ contents: helper, loader: 'js' }))
    plugin.onResolve({ filter: /^(qrcode|jpeg-js)$/ }, args => ({ path: args.path === 'qrcode' ? 'npm:qrcode@1.5.4' : 'npm:jpeg-js@0.4.4', external: true }))
  }
}] })
const source = bundle.outputFiles[0].text
const multipart = new FormData()
multipart.set('metadata', JSON.stringify({ name: slug, entrypoint_path: 'index.js', verify_jwt: false }))
multipart.set('file', new Blob([source], { type: 'application/javascript' }), 'index.js')
const deployed = await sb(`/functions/deploy?slug=${slug}`, { method: 'POST', body: multipart })
console.log(`Deployed isolated function: ${deployed.name || slug}`)

const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/ankhanghome-payment`
const current = await api(cfUrl, env.CLOUDFLARE_API_TOKEN)
if (!current.success) throw new Error('Cannot read Pages settings.')
const configs = { ...current.result.deployment_configs }
for (const environment of ['production', 'preview']) {
  configs[environment] = { ...configs[environment], env_vars: { ...configs[environment]?.env_vars,
    WEBMOBILE_EDGE_URL: { type: 'plain_text', value: `${sbUrl}/functions/v1/${slug}` },
    WEBMOBILE_GATEWAY_SECRET: { type: 'secret_text', value: env.WEBMOBILE_GATEWAY_SECRET }
  } }
}
const configured = await api(cfUrl, env.CLOUDFLARE_API_TOKEN, { ...json({ deployment_configs: configs }), method: 'PATCH' })
if (!configured.success) throw new Error('Cannot configure Pages gateway.')
await mkdir(path.join(root, 'qa'), { recursive: true })
await writeFile(path.join(root, 'qa/cloud-backend-deployment.json'), JSON.stringify({ function: slug, mode: 'demo', provider: env.METER_CLOUD_PROVIDER || 'gemini', cloudKeyProvided: !!env.METER_CLOUD_API_KEY, publicGateway: 'https://phongtroankhang.com/api/health', deployedAt: new Date().toISOString(), storage: 'isolated Supabase demo sessions, no image storage', realPayments: false, realTenantData: false }, null, 2) + '\n')
console.log(`Pages gateway configured. Cloud OCR ${env.METER_CLOUD_API_KEY ? 'configured with the supplied server key' : 'unavailable until a cloud key is supplied'}. Run npm run deploy only if frontend/routes changed.`)
