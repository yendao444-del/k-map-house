import { readFile, writeFile } from 'node:fs/promises'
import { resolveNs, resolveSoa } from 'node:dns/promises'
import { privateConfig } from '../../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) throw new Error('Missing private Cloudflare deployment credentials.')
const domain = 'app.phongtroankhang.com'
const intendedProject = 'ankhanghome-admin-pwa'
const authority = await Promise.allSettled([resolveNs('phongtroankhang.com'),resolveSoa('phongtroankhang.com')])
async function api(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/${path}`, { headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` }, signal: AbortSignal.timeout(15000) })
  const payload = await response.json()
  return { status: response.status, success: payload.success, result: payload.result, errors: payload.errors?.map(item => ({ code: item.code, message: item.message })) }
}
const [projects, zones, publicResponse] = await Promise.all([
  api(`accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects`),
  api('zones?name=phongtroankhang.com'),
  fetch(`https://${domain}/`, { signal: AbortSignal.timeout(15000) }).then(response => ({ reachable: true, status: response.status, finalUrl: response.url, contentType: response.headers.get('content-type') })).catch(error => ({ reachable: false, error: error.cause?.code || error.name }))
])
let dns = { checked: false }
if (zones.success && zones.result?.length === 1) {
  const response = await api(`zones/${zones.result[0].id}/dns_records?name=${domain}`)
  dns = { checked: response.success, status: response.status, records: response.result?.map(item => ({ type: item.type, name: item.name, content: item.content, proxied: item.proxied })), errors: response.errors }
}
// Existing ignored configuration can contain older/narrower overrides. Test
// their read-only zone access without printing tokens, account IDs or unrelated domains.
const credentialSources = []
const seen = new Set()
for (const relative of ['../../.env','../../webmobile/.env','../../webmobile/.env.local','../../webmobile/.env.production.local','../.env','../.env.local']) {
  try {
    const content = await readFile(new URL(relative,import.meta.url),'utf8')
    const token = content.split(/\r?\n/).map(line => line.match(/^CLOUDFLARE_API_TOKEN\s*=\s*(.*)$/)?.[1]?.trim().replace(/^['"]|['"]$/g,'')).find(Boolean)
    if (!token || seen.has(token)) continue
    seen.add(token)
    const response = await fetch('https://api.cloudflare.com/client/v4/zones?name=phongtroankhang.com',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)})
    const payload = await response.json()
    credentialSources.push({source:relative,status:response.status,success:payload.success,matchingZones:payload.result?.length,errorCodes:payload.errors?.map(item => item.code)})
  } catch (error) {
    if (error.code !== 'ENOENT') credentialSources.push({source:relative,error:error.cause?.code || error.name})
  }
}
const report = {
  checkedAt: new Date().toISOString(), mode: 'read-only; no Pages/DNS/Auth mutation', domain, intendedProject,
  projectRead: { status: projects.status, success: projects.success, exists: projects.result?.some(item => item.name === intendedProject), existingDomainOwner: projects.result?.filter(item => item.domains?.includes(domain)).map(item => item.name), errors: projects.errors },
  zoneRead: { status: zones.status, success: zones.success, matchingZones: zones.result?.length, errors: zones.errors }, dns, publicResponse,
  publicDns: { nameservers: authority[0].status==='fulfilled' ? authority[0].value : null, soa: authority[1].status==='fulfilled' ? {primary:authority[1].value.nsname,administrator:authority[1].value.hostmaster} : null },credentialSources,
  invariants: ['Only app.phongtroankhang.com is in deployment scope.', 'Do not overwrite any existing unrelated DNS record/project.', 'pay.phongtroankhang.com and root/www site remain untouched.', 'PWA must use HTTPS for installation and service workers.']
}
await writeFile(new URL('../qa/hosting-readonly-audit.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
