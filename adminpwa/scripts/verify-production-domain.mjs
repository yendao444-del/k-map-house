import assert from 'node:assert/strict'
import { Resolver, lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { request as httpRequest } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { privateConfig } from '../../webmobile/scripts/private-config.mjs'

const hostname = 'app.phongtroankhang.com'
const origin = `https://${hostname}`
const env = await privateConfig()
const dnsEvidence = []
for (const server of ['1.1.1.1', '8.8.8.8', '172.64.34.110']) {
  const resolver = new Resolver({ timeout: 5000, tries: 1 })
  resolver.setServers([server])
  try { dnsEvidence.push({ server, addresses: await resolver.resolve4(hostname) }) }
  catch (error) { dnsEvidence.push({ server, error: error.code }) }
}
const address = dnsEvidence.find(item => item.addresses?.length)?.addresses[0]
assert.ok(address, 'Production domain does not resolve through a public/authoritative DNS server.')
let systemDns
try { systemDns = { resolved: true, ...await lookup(hostname) } }
catch (error) { systemDns = { resolved: false, error: error.code } }

function get(path = '/', secure = true) {
  return new Promise((resolve, reject) => {
    const send = secure ? request : httpRequest
    const req = send({ hostname, path, method: 'GET', port: secure ? 443 : 80,
      // Resolve via a verified public resolver, preserving real hostname/SNI
      // and TLS certificate verification. No hosts-file or insecure TLS override.
      lookup: (_name, options, callback) => options.all ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4)
    }, response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { body += chunk; if (body.length > 5000000) req.destroy(new Error('Response too large')) })
      const tlsVerified = secure ? response.socket?.authorized === true : undefined
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body, tlsVerified }))
    })
    req.setTimeout(15000, () => req.destroy(new Error('Request timeout')))
    req.on('error', reject)
    req.end()
  })
}
const index = await get(`/?release-check=${Date.now()}`)
assert.equal(index.status, 200)
assert.equal(index.tlsVerified, true, 'Production TLS certificate verification failed.')
const entry = index.body.match(/src="([^" ]+\.js)"/)?.[1]
const localIndex = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')
const expectedEntry = localIndex.match(/src="([^" ]+\.js)"/)?.[1]
assert.ok(entry && entry === expectedEntry, 'Production domain is not serving the current local build.')
const [asset, manifest, worker, http] = await Promise.all([get(entry), get('/manifest.webmanifest'), get('/sw.js'), get('/', false)])
assert.equal(asset.status, 200)
assert.ok(asset.headers['content-type']?.includes('javascript'))
assert.equal(manifest.status, 200)
assert.equal(worker.status, 200)
assert.ok([301, 302, 307, 308].includes(http.status) && http.headers.location === `${origin}/`, 'HTTP must redirect to the actual HTTPS domain.')
const securityHeaders = Object.fromEntries(['x-content-type-options', 'x-frame-options', 'content-security-policy', 'cache-control'].map(name => [name, index.headers[name]]))
assert.equal(securityHeaders['x-content-type-options'], 'nosniff')
assert.equal(securityHeaders['x-frame-options'], 'DENY')
assert.ok(securityHeaders['content-security-policy'])
const domainResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/ankhanghome-admin-pwa/domains`, {
  headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` }, signal: AbortSignal.timeout(15000)
})
const payload = await domainResponse.json()
const domain = payload.result?.find(item => item.name === hostname)
assert.equal(domain?.status, 'active', 'Pages custom domain must be active.')
const report = {
  verifiedAt: new Date().toISOString(), target: origin, pagesDomainStatus: domain.status,
  dnsEvidence, systemDns, transport: 'Public-DNS-resolved IP with real production hostname/SNI and normal certificate validation',
  tlsVerified: index.tlsVerified, status: index.status, entry, expectedEntry,
  assetStatus: asset.status, manifestStatus: manifest.status, serviceWorkerStatus: worker.status,
  httpRedirect: { status: http.status, location: http.headers.location }, securityHeaders,
  limitations: systemDns.resolved ? ['Authenticated mobile workflows still require acceptance.'] : ['System resolver still has a negative DNS result; browser reachability must be rechecked without overrides.', 'Authenticated mobile workflows still require acceptance.']
}
await writeFile(new URL('../qa/production-domain-verification.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
