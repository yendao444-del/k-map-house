import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import autoprefixer from 'autoprefixer'
import { resolve } from 'node:path'
const server = await createServer({
  configFile: false,
  root: resolve('design-references/gmail-simple'),
  plugins: [
    { name: 'email-qa-fixtures', enforce: 'pre', resolveId(id) {
      if (id === '../lib/db') return resolve('design-references/gmail-simple/mock-db.ts')
    } }, react()
  ],
  css: { postcss: { plugins: [tailwindcss(), autoprefixer()] } },
  server: { host: '127.0.0.1', port: 4187, strictPort: true, fs: { allow: [process.cwd()] } }
})
await server.listen()
console.log('Gmail QA preview: http://127.0.0.1:4187/')
