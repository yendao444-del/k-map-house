import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(root, '../../..')
const mocks = { db: '../contract/db-mock.ts', 'contract-drafts': 'drafts-mock.ts', 'contract-confirmation': 'confirmation-mock.ts', 'tenant-email': 'tenant-email-mock.ts' }
export default defineConfig({
  root, server: { host: '127.0.0.1', port: 5188, strictPort: true, fs: { allow: [appRoot] } },
  resolve: { dedupe: ['react', 'react-dom', '@tanstack/react-query'] },
  plugins: [{ name: 'isolated-save-send-fixtures', enforce: 'pre', resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) return
    const file = path.resolve(path.dirname(importer), source).replaceAll('\\', '/')
    for (const [name, mock] of Object.entries(mocks)) {
      if (file === path.join(appRoot, 'src/renderer/src/lib', name).replaceAll('\\', '/')) return path.resolve(root, mock)
    }
  } }, react()], css: { postcss: { plugins: [tailwindcss()] } }
})
