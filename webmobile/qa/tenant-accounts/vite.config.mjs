import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root=path.dirname(fileURLToPath(import.meta.url)),appRoot=path.resolve(root,'../../..')
export default defineConfig({root,resolve:{dedupe:['react','react-dom'],alias:{react:path.join(appRoot,'node_modules/react'),'react-dom':path.join(appRoot,'node_modules/react-dom')}},server:{host:'127.0.0.1',port:5194,strictPort:true,fs:{allow:[appRoot]}},plugins:[{name:'tenant-account-qa',enforce:'pre',resolveId(source,importer){
  if(!importer||!source.startsWith('.'))return
  const resolved=path.resolve(path.dirname(importer),source).replaceAll('\\','/')
  if(resolved===path.join(appRoot,'src/renderer/src/lib/db').replaceAll('\\','/'))return path.join(root,'db-mock.ts')
  if(resolved===path.join(appRoot,'src/renderer/src/lib/supabase').replaceAll('\\','/'))return path.join(root,'supabase-mock.ts')
  if(!importer.replaceAll('\\','/').endsWith('/accounts-mock.ts')&&resolved===path.join(appRoot,'src/renderer/src/lib/tenant-web-accounts').replaceAll('\\','/'))return path.join(root,'accounts-mock.ts')
}},react()],css:{postcss:{plugins:[tailwindcss()]}}})
