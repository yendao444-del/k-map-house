import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(root,'../../..')
export default defineConfig({root,server:{host:'127.0.0.1',port:5187,strictPort:true,fs:{allow:[appRoot]}},plugins:[{name:'isolated-contract-fixtures',enforce:'pre',resolveId(source,importer){
  if (!importer || !source.startsWith('.')) return
  const file = path.resolve(path.dirname(importer),source).replaceAll('\\','/')
  if (file===path.join(appRoot,'src/renderer/src/lib/db').replaceAll('\\','/')) return path.join(root,'db-mock.ts')
  if (file===path.join(appRoot,'src/renderer/src/lib/contract-drafts').replaceAll('\\','/')) return path.join(root,'drafts-mock.ts')
}},react()],css:{postcss:{plugins:[tailwindcss()]}}})
