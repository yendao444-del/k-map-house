import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import { privateConfig, management, root } from './private-config.mjs'
const env=await privateConfig()
await management(env,'/database/query',{query:await readFile(path.join(root,'cloud/tenant-accounts-schema.sql'),'utf8')})
await management(env,'/database/query',{query:await readFile(path.join(root,'../supabase/migrations/20261008220000_tenant_system_email_separation.sql'),'utf8')})
await management(env,'/database/query',{query:await readFile(path.join(root,'../supabase/migrations/20261008233000_tenant_auth_provisioning.sql'),'utf8')})
const bundle=await build({entryPoints:[path.join(root,'cloud/tenant-admin-edge.mjs')],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022'})
const form=new FormData()
form.set('metadata',JSON.stringify({name:'tenant-web-admin',entrypoint_path:'index.js',verify_jwt:false}))
form.set('file',new Blob([bundle.outputFiles[0].text],{type:'application/javascript'}),'index.js')
const ref=new URL(env.SUPABASE_URL||env.VITE_SUPABASE_URL).hostname.split('.')[0]
const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=tenant-web-admin`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},body:form,signal:AbortSignal.timeout(30000)})
if(!response.ok)throw new Error(`Deploy tenant account backend ${response.status}`)
console.log('Tenant account schema and admin-only function deployed. No tenant accounts provisioned automatically.')
