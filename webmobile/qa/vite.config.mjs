import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const appRoot = path.resolve('.')
const root = path.dirname(fileURLToPath(import.meta.url))
const bundle = path.join(root, 'private', 'qa-reader.mjs')
await fs.mkdir(path.dirname(bundle), { recursive: true })
await build({entryPoints:[path.join(appRoot,'src/main/tenant-identity-reader.ts')],bundle:true,platform:'node',format:'esm',packages:'external',outfile:bundle})
const { readTenantIdentity, decodeIdentityImage } = await import(pathToFileURL(bundle).href+'?t='+Date.now())
let fixtureIndex = 0
let busy = false
export default defineConfig({
  root, server: { host:'127.0.0.1', port:5186, strictPort:true, fs:{allow:[appRoot]} },
  plugins: [react(), {name:'identity-qa-api', configureServer(server) {
    server.middlewares.use('/qa-api', async (req,res) => {
      res.setHeader('Content-Type','application/json')
      try {
        const route = req.url?.split('?')[0]
        if(route==='/fixture') {
          const files=(await fs.readdir(path.join(appRoot,'webmobile/test image'))).filter(x=>x.endsWith('.jpg'))
          const file=files[fixtureIndex++ % files.length]
          const bytes=await fs.readFile(path.join(appRoot,'webmobile/test image',file))
          return res.end(JSON.stringify({dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64'),name:file}))
        }
        let raw=''
        for await (const chunk of req) {raw+=chunk; if(raw.length > 8_000_000) throw new Error('Too large')}
        const payload=JSON.parse(raw||'{}')
        if(route==='/read') {
          if(busy) return res.end(JSON.stringify({ok:false,error:'Đang đọc ảnh khác.'}))
          busy=true
          try {return res.end(JSON.stringify(await readTenantIdentity(decodeIdentityImage(payload.dataUrl),path.join(appRoot,'resources/identity-ocr'))))}
          finally {busy=false}
        }
        if(route==='/save') {
          await fs.writeFile(path.join(root,'private/saved-tenant.json'),JSON.stringify(payload))
          return res.end(JSON.stringify({ok:true,imagesSaved:!!payload.identity_image_url}))
        }
        res.statusCode=404;res.end('{}')
      } catch { res.statusCode=400;res.end(JSON.stringify({ok:false,error:'Ảnh chưa hợp lệ.'})) }
    })
  }}],
  css:{postcss:{plugins:[tailwindcss()]}}
})
