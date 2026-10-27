// Read-only release checks. No login, cycle creation, invoice or bank writes.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {root,privateConfig,management} from './private-config.mjs'
const env=await privateConfig(),origin='https://pay.phongtroankhang.com'
assert.equal(new URL(env.SUPABASE_URL).hostname.split('.')[0],'wtrycmiojsiliyjxsewz')
const html=await fetch(origin+'/?release-review='+Date.now(),{signal:AbortSignal.timeout(20000)})
assert.equal(html.status,200)
const content=await html.text(),local=await readFile(path.join(root,'dist/index.html'),'utf8')
const entry=local.match(/src="([^" ]+\.js)"/)?.[1];assert.ok(entry);assert.ok(content.includes(entry))
const asset=await fetch(new URL(entry,origin));const js=await asset.text()
assert.equal(js,(await readFile(path.join(root,'dist',entry),'utf8')).toString(),'Deployed bundle differs from tested build')
assert.ok(js.includes('Xác minh số'));assert.ok(js.includes('Xác nhận · Tiếp tục nước'));assert.ok(js.includes('Xác nhận · Lập hóa đơn'))
assert.ok(!js.includes('autoConfirmed'));assert.ok(!js.includes('MÔ PHỎNG PHÒNG 999'));assert.ok(!js.includes('Không mở được camera?'))
const csp=html.headers.get('content-security-policy'),policy=html.headers.get('permissions-policy')
assert.match(csp,/img-src[^;]*https:\/\/qr\.sepay\.vn/)
assert.match(policy,/camera=\(self\)/)
const images=[]
for(const meter of ['electric','water']){
 const response=await fetch(origin+'/assets/meter-'+meter+'.webp');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/webp/)
 const bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.equals(await readFile(path.join(root,'public/assets/meter-'+meter+'.webp'))));images.push(meter)
}
const denied=[]
for(const [endpoint,data] of [['tenant-payments',{action:'state'}],['meter-ocr',{meter:'electric'}]]){
 const response=await fetch(origin+'/api/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(data)})
 assert.equal(response.status,401);denied.push({endpoint,status:response.status})
}
const bank=(await management(env,'/database/query',{query:`select bank_id,account_name,account_no ~ '^[A-Za-z0-9]{6,30}$' valid_account,account_no ~ '[A-Za-z]' virtual_account from app_settings limit 1` }))[0]
assert.equal(bank.bank_id,'BIDV');assert.equal(bank.valid_account,true)
assert.equal(bank.account_name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toUpperCase().trim(),'DO KIM NGAN')
const schemas=await management(await (async()=>{const {contractTestConfig}=await import('./contract-test-config.mjs');return contractTestConfig()})(),'/database/query',{query:`select schema_name from information_schema.schemata where schema_name in ('ankhang_payment_qa','ankhang_payment_e2e_qa')`})
assert.equal(schemas.length,0,'Test schemas were not cleaned up')
const proof={at:new Date().toISOString(),passed:true,origin,entry,sha256:createHash('sha256').update(js).digest('hex'),cameraAllowed:true,qrAllowed:true,images,denied,recipient:{bank:bank.bank_id,ownerVerified:true,virtualAccount:bank.virtual_account},testSchemasClean:true,productionBusinessWrites:false}
await writeFile(path.join(root,'qa/tenant-payment-flow-release.json'),JSON.stringify(proof,null,2)+'\n')
console.log('PASS: deployed bundle, restored verification steps, camera/QR CSP, images, login isolation, live BIDV configuration and test cleanup.')
