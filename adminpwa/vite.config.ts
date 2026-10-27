import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import autoprefixer from 'autoprefixer'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Electron configuration is read-only. Only these PUBLIC values are carried
// across; never load a service-role key or the root VITE_CONTRACT_DB_SCHEMA.
export default defineConfig(({ mode }) => {
  const existing = loadEnv(mode, fileURLToPath(new URL('../', import.meta.url)), 'VITE_')
  const current = loadEnv(mode, process.cwd(), 'VITE_')
  const publicKeys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_CONTRACT_CONFIRMATION_API_URL', 'VITE_PWA_ORIGIN']
  return {
    plugins: [react()],
    envPrefix: [],
    define: Object.fromEntries([
      ...publicKeys.map((key) => [`import.meta.env.${key}`, JSON.stringify(process.env[key] || current[key] || existing[key] || '')]),
      ['import.meta.env.VITE_CONTRACT_DB_SCHEMA', JSON.stringify(current.VITE_CONTRACT_DB_SCHEMA || 'public')],
      ['import.meta.env.VITE_APP_VERSION', JSON.stringify(version)]
    ]),
    resolve: { alias: { '@renderer': fileURLToPath(new URL('./src/renderer/src', import.meta.url)) } },
    css: { postcss: { plugins: [tailwindcss(), autoprefixer()] } },
    server: { host: '127.0.0.1', port: 4178, strictPort: true, proxy: { '/api/management-auth': { target: 'https://app.phongtroankhang.com', changeOrigin: true } } },
    build: { sourcemap: false, target: 'es2022' }
  }
})
