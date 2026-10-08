import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { root } from './private-config.mjs'
export async function contractTestConfig() {
  const env = {}
  for (const line of (await readFile(path.join(root, '.env.contract-test.local'), 'utf8')).split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  const ref = new URL(env.SUPABASE_URL).hostname.split('.')[0]
  if (ref !== 'gsianbstkmyutnhromwc' || ref !== env.CONTRACT_TEST_PROJECT_REF || env.CONTRACT_ENVIRONMENT !== 'test') throw new Error('TEST project configuration mismatch. Production deployment is forbidden.')
  return env
}
export async function testManagement(env, suffix, data, method) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${env.CONTRACT_TEST_PROJECT_REF}${suffix}`, { method: method || (data ? 'POST' : 'GET'), headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`TEST management ${response.status} ${suffix}: ${(await response.text()).slice(0,400)}`)
  const text = await response.text(); return text ? JSON.parse(text) : null
}
