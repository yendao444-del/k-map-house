import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = new URL('../dist/', import.meta.url)
const forbidden = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ACCESS_TOKEN', 'CLOUDFLARE_API_TOKEN', 'RESEND_API_KEY', 'BEGIN PRIVATE KEY']
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) await scan(file)
    else if (/\.(js|html|json|css)$/.test(entry.name)) {
      const content = await readFile(file, 'utf8')
      for (const marker of forbidden) if (content.includes(marker)) throw new Error(`Private-key marker in bundle: ${marker}`)
      // Public Supabase anon JWT is allowed; no elevated JWT may ship.
      for (const token of content.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []) {
        try { if (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role === 'service_role') throw new Error('Elevated Supabase JWT in public bundle') }
        catch (error) { if (error.message === 'Elevated Supabase JWT in public bundle') throw error }
      }
    }
  }
}
await scan(fileURLToPath(root))
console.log('Public bundle scan passed (private-key markers and elevated JWTs).')
