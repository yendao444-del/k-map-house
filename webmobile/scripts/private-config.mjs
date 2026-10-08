import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
export const root = fileURLToPath(new URL('../', import.meta.url))
export async function privateConfig() {
  const env = { ...process.env }
  for (const file of ['../.env', '.env', '.env.local', '.env.production.local']) {
    try {
      for (const line of (await readFile(path.join(root, file), 'utf8')).split(/\r?\n/)) {
        const match = line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/)
        if (match) { const value = match[2].trim().replace(/^['"]|['"]$/g, ''); if (value) env[match[1]] = value }
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return env
}
export async function management(env, suffix, data, method) {
  const ref = new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL).hostname.split('.')[0]
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}${suffix}`, {
    method: method || (data ? 'POST' : 'GET'), headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(30000)
  })
  if (!response.ok) throw new Error(`Supabase management ${response.status} ${suffix}`)
  const text = await response.text()
  return text ? JSON.parse(text) : null
}
