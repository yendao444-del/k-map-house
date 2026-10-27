import { writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../../webmobile/scripts/private-config.mjs'

const env = await privateConfig()
if (!env.SUPABASE_ACCESS_TOKEN || !(env.SUPABASE_URL || env.VITE_SUPABASE_URL)) throw new Error('Missing Supabase management credentials.')

const target = 'https://app.phongtroankhang.com/**'
const before = await management(env, '/config/auth')
const existing = String(before.uri_allow_list || '')
  .split(/[\n,]+/)
  .map(value => value.trim())
  .filter(Boolean)
const next = [...new Set([...existing, target])]

if (next.some(value => value === target ? false : value.length === 0)) throw new Error('Refusing to write an empty redirect entry.')

await management(env, '/config/auth', { uri_allow_list: next.join(',') }, 'PATCH')
const after = await management(env, '/config/auth')
const report = {
  configuredAt: new Date().toISOString(),
  mode: 'additive Auth redirect update; site URL and unrelated settings preserved',
  target,
  before: { siteUrl: before.site_url, redirectAllowList: before.uri_allow_list || '' },
  after: { siteUrl: after.site_url, redirectAllowList: after.uri_allow_list || '' },
  verified: after.site_url === before.site_url && String(after.uri_allow_list || '').split(/[\n,]+/).map(value => value.trim()).filter(Boolean).includes(target)
}
await writeFile(new URL('../qa/auth-redirect-production.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (!report.verified) process.exitCode = 1
