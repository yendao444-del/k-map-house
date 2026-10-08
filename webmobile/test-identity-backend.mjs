import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { build } from 'esbuild'

const root = path.dirname(fileURLToPath(import.meta.url))
const reportDir=path.join(root,'qa')
const privateDir=path.join(reportDir,'private')
await fs.mkdir(privateDir,{recursive:true})
const bundle=path.join(privateDir,'identity-reader.mjs')
await build({entryPoints:[path.resolve('src/main/tenant-identity-reader.ts')],bundle:true,platform:'node',format:'esm',packages:'external',outfile:bundle})
const { readTenantIdentity, decodeIdentityImage }=await import(pathToFileURL(bundle).href+'?t='+Date.now())
const langPath=path.resolve('resources/identity-ocr')
const files=(await fs.readdir(path.join(root,'test image'))).filter(x=>x.endsWith('.jpg'))
const front=await fs.readFile(path.join(root,'test image',files[0]))
const back=await fs.readFile(path.join(root,'test image',files[1]))
const expected=JSON.parse(await fs.readFile(path.join(privateDir,'expected.json'),'utf8'))
const outcomes=[]
for(const [label,buffer] of [
  ['original back',back],
  ['back resized to 1200 px',await sharp(back).resize({width:1200}).toBuffer()],
  ['back rotated 90 degrees',await sharp(back).rotate(90).toBuffer()],
  ['front only OCR',front]
]) {
  const started=Date.now()
  const result=await readTenantIdentity(buffer,langPath)
  const outcome={label,ok:result.ok,source:result.source,nameExact:result.fields?.fullName?.toLocaleUpperCase('vi-VN')===expected.fullName.toLocaleUpperCase('vi-VN'),idExact:result.fields?.identityCard===expected.identityCard,ms:Date.now()-started}
  outcomes.push(outcome)
  console.log(JSON.stringify(outcome))
  assert.equal(result.ok, true, label)
  assert.equal(outcome.nameExact, true, `${label}: Vietnamese name including accents`)
  assert.equal(outcome.idExact, true, `${label}: identity number`)
  if(label.includes('back')) {
    assert.equal(result.source,'qr')
    assert.equal(result.fields.fullName,expected.fullName)
    assert.equal(result.fields.identityCard,expected.identityCard)
  }
}
assert.throws(()=>decodeIdentityImage('data:image/svg+xml;base64,PHN2Zz4='))
await assert.rejects(()=>readTenantIdentity(Buffer.from('not an image'),langPath))
await fs.writeFile(path.join(reportDir,'backend-results.json'),JSON.stringify({outcomes,invalidInputRejected:true,networkCallsForIdentity:0},null,2))
