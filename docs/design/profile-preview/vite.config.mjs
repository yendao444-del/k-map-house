import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import autoprefixer from 'autoprefixer'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('./', import.meta.url))
export default defineConfig({
  root, plugins:[react()],
  resolve:{dedupe:['react','react-dom'],alias:[
    {find:/^\.\.\/lib\/db$/,replacement:fileURLToPath(new URL('./preview-db.ts',import.meta.url))},
    {find:/^\.\.\/lib\/mfa$/,replacement:fileURLToPath(new URL('./preview-mfa.ts',import.meta.url))}
  ]},
  css:{postcss:{plugins:[tailwindcss(),autoprefixer()]}},
  server:{host:'127.0.0.1',port:4194,strictPort:true,fs:{allow:[fileURLToPath(new URL('../../../',import.meta.url))]}}
})
