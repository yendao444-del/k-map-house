import assert from 'node:assert/strict'
import {readdir,readFile,writeFile} from 'node:fs/promises'
import sharp from 'sharp'
import {privateConfig} from './private-config.mjs'
import {readCloudMeter} from '../cloud/online-reader.mjs'
const env=await privateConfig()
assert.ok(env.METER_CLOUD_API_KEY,'Gemini key missing')
assert.equal(env.METER_CLOUD_PROVIDER,'gemini')
const dir='C:/Users/Admin/Downloads/dien nuoc/',files=(await readdir(dir)).filter(f=>f.endsWith('.jpg')).sort().slice(0,2)
const results=[]
for(const [i,f] of files.entries()) {
 const image=await sharp(await readFile(dir+f)).rotate().resize({width:2560,height:2560,fit:'inside'}).jpeg({quality:95}).toBuffer()
 const meter=i===0?'electric':'water',expected=i===0?12692:287
 const started=Date.now(),result=await readCloudMeter('data:image/jpeg;base64,'+image.toString('base64'),meter,env)
 assert.equal(result.ok,true,`${meter}: ${result.reason}`);assert.equal(result.reading,expected)
 results.push({meter,reading:result.reading,expected,elapsedMs:Date.now()-started})
}
const wrongImage=await sharp(await readFile(dir+files[0])).resize({width:1920,height:2560,fit:'inside'}).jpeg({quality:95}).toBuffer()
const wrong=await readCloudMeter('data:image/jpeg;base64,'+wrongImage.toString('base64'),'water',env)
assert.equal(wrong.ok,false,'Electric photo accepted as water')
await writeFile('webmobile/qa/tenant-gemini-live.json',JSON.stringify({at:new Date().toISOString(),provider:env.METER_CLOUD_PROVIDER,model:env.METER_CLOUD_MODEL,results,wrongMeterRejected:true,businessDataChanged:false},null,2)+'\n')
console.log(JSON.stringify({results,wrongMeterRejected:true}))
