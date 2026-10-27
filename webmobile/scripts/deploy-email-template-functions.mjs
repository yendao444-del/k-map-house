import { build } from 'esbuild'
import { privateConfig } from './private-config.mjs'

const env = await privateConfig()
const ref = new URL(env.SUPABASE_URL).hostname.split('.')[0]
if (ref !== 'wtrycmiojsiliyjxsewz') throw new Error(`Expected production project, got ${ref}`)
const slugs = ['email-automation', 'send-email-notification', 'sepay-webhook', 'admin-pwa-bridge']
for (const slug of slugs) {
  const bundle = await build({
    entryPoints: [`supabase/functions/${slug}/index.ts`], bundle: true, write: false,
    format: 'esm', platform: 'neutral', target: 'es2022', external: ['https://*', 'http://*']
  })
  const form = new FormData()
  form.set('metadata', JSON.stringify({ name: slug, entrypoint_path: 'index.js', verify_jwt: false }))
  form.set('file', new Blob([bundle.outputFiles[0].text], { type: 'application/javascript' }), 'index.js')
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${slug}`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, body: form,
    signal: AbortSignal.timeout(60000)
  })
  if (!response.ok) throw new Error(`${slug} deployment failed: HTTP ${response.status} ${await response.text()}`)
  console.log(`${slug}: deployed (${bundle.outputFiles[0].text.length} bytes)`)
}
