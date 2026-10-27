import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import autoprefixer from 'autoprefixer'
import { fileURLToPath } from 'node:url'

const server = await createServer({
  root: process.cwd(), configFile: false,
  cacheDir: 'node_modules/.vite-gold-compact-qa',
  optimizeDeps: { entries: ['docs/design/gold-compact-2026-10-20/qa/index.html'] },
  plugins: [react(), { name: 'isolated-gold-fixture', enforce: 'pre', resolveId(id, importer) {
    if (id.endsWith('/lib/db') || (id === './db' && importer?.includes('/src/renderer/src/lib/'))) return fileURLToPath(new URL('./db.ts', import.meta.url))
    if (id.endsWith('/lib/goldApi')) return fileURLToPath(new URL('./gold-api.ts', import.meta.url))
  } }],
  css: { postcss: { plugins: [tailwindcss(), autoprefixer()] } },
  server: { host: '127.0.0.1', port: 4190, strictPort: true }
})
await server.listen()
console.log('Read-only Gold QA: http://127.0.0.1:4190/docs/design/gold-compact-2026-10-20/qa/index.html')
