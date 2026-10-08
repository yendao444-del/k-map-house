const {app}=require('electron')
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict')
const {createRequire}=require('node:module')
const root=path.resolve(__dirname,'../..')
const privateDir=path.join(__dirname,'private')
app.setPath('userData',path.join(privateDir,'electron-test-profile'))
app.whenReady().then(async()=>{
 try {
  const resources=path.join(root,'dist/win-unpacked/resources')
  const packedRequire=createRequire(path.join(resources,'app.asar/package.json'))
  const readerSource=fs.readFileSync(path.join(privateDir,'pack-reader.cjs'),'utf8')
  const exports={};const module={exports}
  vm.runInNewContext(readerSource,{exports,module,require:packedRequire,__filename:path.join(resources,'app.asar/out/main/identity-test.cjs'),__dirname:path.join(resources,'app.asar/out/main'),Buffer,console,setTimeout,clearTimeout,Uint8ClampedArray,URL,process})
  const images=fs.readdirSync(path.join(root,'webmobile/test image')).filter(x=>x.endsWith('.jpg'))
  const expected=JSON.parse(fs.readFileSync(path.join(privateDir,'expected.json'),'utf8'))
  const results=[]
  for(const [label,file] of [['QR',images[1]],['OCR',images[0]]]){
   const bytes=fs.readFileSync(path.join(root,'webmobile/test image',file))
   const result=await module.exports.readTenantIdentity(bytes,path.join(resources,'identity-ocr'))
   assert.equal(result.ok,true)
   assert.equal(result.fields.fullName.toLocaleUpperCase('vi-VN'),expected.fullName.toLocaleUpperCase('vi-VN'))
   assert.equal(result.fields.identityCard,expected.identityCard)
   results.push({label,nameExact:true,idExact:true})
  }
  fs.writeFileSync(path.join(__dirname,'packaged-runtime-results.json'),JSON.stringify({electron:process.versions.electron,packagedDependencies:true,localModels:true,results},null,2))
  console.log('PACKAGED_RUNTIME_PASS')
  app.exit(0)
 }catch(error){fs.writeFileSync(path.join(__dirname,'packaged-runtime-results.json'),JSON.stringify({passed:false,error:String(error)}));console.error(error);app.exit(1)}
})
