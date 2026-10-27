import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { root, privateConfig, management } from './private-config.mjs'
import { contractTestConfig, testManagement } from './contract-test-config.mjs'

// Deploy only code. Keep schema, Auth guards, provider keys and Pages bindings.
const test=process.argv.includes('--test'),env=test?await contractTestConfig():await privateConfig()
const ref=new URL(env.SUPABASE_URL).hostname.split('.')[0]
assert.equal(ref,test?'gsianbstkmyutnhromwc':'wtrycmiojsiliyjxsewz')
const query=sql=>(test?testManagement:management)(env,'/database/query',{query:sql})
const schema=test?env.CONTRACT_DB_SCHEMA:'public'
const counts=async()=>(await query(`select jsonb_build_object('rooms',(select count(*) from ${schema}.rooms),'tenants',(select count(*) from ${schema}.tenants),'contracts',(select count(*) from ${schema}.contracts),'accounts',(select count(*) from ${schema}.tenant_web_accounts),'authUsers',(select count(*) from auth.users)) counts`))[0].counts
const before=await counts(),slug=test?'contract-test-auth':'webmobile-demo'
let plugins=[]
if(!test) {
 const transfer=await readFile(path.join(root,'../src/renderer/src/lib/invoiceTransfer.ts'),'utf8')
 const modal=await readFile(path.join(root,'../src/renderer/src/components/InvoiceDetailModal.tsx'),'utf8')
 const ast=ts.createSourceFile('InvoiceDetailModal.tsx',modal,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX)
 const words=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='numberToWords')
 assert.ok(words,'Missing existing Electron transfer helper')
 const helper=ts.transpileModule(`${transfer}\nexport ${words.getText(ast)}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
 plugins=[{name:'existing-electron-helpers',setup(plugin){
  plugin.onResolve({filter:/electron-transfer-adapter\.mjs$/},()=>({path:'electron-pure',namespace:'pure'}))
  plugin.onLoad({filter:/.*/,namespace:'pure'},()=>({contents:helper,loader:'js'}))
  plugin.onResolve({filter:/^(qrcode|jpeg-js)$/},args=>({path:args.path==='qrcode'?'npm:qrcode@1.5.4':'npm:jpeg-js@0.4.4',external:true}))
 }}]
}
const bundle=await build({entryPoints:[path.join(root,'cloud',test?'contract-test-auth-edge.mjs':'edge.mjs')],bundle:true,write:false,format:'esm',platform:test?'neutral':'node',target:'es2022',external:['node:*'],plugins})
assert.ok(bundle.outputFiles[0].text.includes('room_assets?room_id=eq.'),'Tenant inventory absent from bundle')
const form=new FormData()
form.set('metadata',JSON.stringify({name:slug,entrypoint_path:'index.js',verify_jwt:false}))
form.set('file',new Blob([bundle.outputFiles[0].text],{type:'application/javascript'}),'index.js')
const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${slug}`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},body:form,signal:AbortSignal.timeout(30000)})
assert.ok(response.ok,`Deploy ${slug}: ${response.status}`)
const after=await counts();assert.deepEqual(after,before)
await writeFile(path.join(root,`qa/tenant-room-menu-${test?'test':'production'}-backend.json`),JSON.stringify({at:new Date().toISOString(),project:ref,function:slug,before,after,schemaChanged:false,emailsSent:false},null,2)+'\n')
console.log(`${test?'TEST':'Production'} tenant room/inventory backend deployed. Business/Auth counts unchanged; schema/secrets unchanged.`)
