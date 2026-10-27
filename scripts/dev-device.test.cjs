const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { build } = require('esbuild')
const token = 'a'.repeat(64) + '.' + 'b'.repeat(64)
const source = fs.readFileSync(path.join(__dirname, '../src/main/dev-device.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function harness({packaged=false,url='http://localhost:5173',platform='win32',exists=true,decrypted=token}={}) {
  let handler; const calls=[]
  const context=vm.createContext({exports:{},URL,__dirname:'G:/workspace/out/main',process:{platform,env:{ELECTRON_RENDERER_URL:url}},require(name) {
    if(name==='electron') return {app:{isPackaged:packaged}}
    if(name==='node:fs') return {existsSync:()=>exists,readFileSync:()=> 'encrypted-fixture'}
    if(name==='node:path') return path
    if(name==='node:child_process') return {execFileSync:(...args)=>{calls.push(args);return decrypted}}
    if(name==='./trusted-ipc') return {trustedIpcMain:{handle:(channel,callback)=>{assert.equal(channel,'devDevice:credential');handler=callback}}}
    throw Error('Unexpected module')
  }})
  vm.runInContext(compiled,context);context.exports.registerDevDevice()
  return {run:()=>handler(),calls}
}
test('packaged, preview, remote renderer and other platforms cannot load the dev credential',()=>{
  for(const options of [{packaged:true},{url:''},{url:'https://app.phongtroankhang.com'},{url:'http://attacker.invalid:5173'},{url:'invalid'},{platform:'linux'},{exists:false}]) {
    const h=harness(options);assert.equal(h.run(),null);assert.equal(h.calls.length,0)
  }
})
test('loopback dev uses Windows CurrentUser encryption, hidden process and a fixed file',()=>{
  const h=harness();assert.equal(h.run(),token)
  assert.equal(h.calls[0][0],'powershell.exe');assert.equal(h.calls[0][2].windowsHide,true)
  assert.match(h.calls[0][1].at(-1),/CurrentUser/);assert.equal(h.calls[0][2].input,'encrypted-fixture')
  assert.ok(!h.calls[0][1].join(' ').includes(token));assert.equal(harness({decrypted:'invalid'}).run(),null)
})
test('release renderer contains no code to fetch the local device credential',async()=>{
  const result=await build({entryPoints:[path.join(__dirname,'../src/renderer/src/lib/management-auth-client.ts')],bundle:true,write:false,minify:true,format:'esm',define:{'import.meta.env.DEV':'false'}})
  assert.ok(!result.outputFiles[0].text.includes('devDevice'))
  assert.ok(!result.outputFiles[0].text.includes('.dpapi'))
})
test('frontend only skips TOTP lookup for a ready, server-verified dev device',async()=>{
  const mfa=fs.readFileSync(path.join(__dirname,'../src/renderer/src/lib/mfa.ts'),'utf8')
  const start=mfa.indexOf('export async function requireSessionMfa'),end=mfa.indexOf('export async function cancelMfaLogin',start)
  let lookups=0
  const context=vm.createContext({listTotpFactors:async()=>{lookups++;throw Error('lookup-required')}})
  vm.runInContext(ts.transpileModule(mfa.slice(start,end).replace('export async function','async function'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context)
  await context.requireSessionMfa({state:'ready',device_verified:true,login_method:'dev_device'});assert.equal(lookups,0)
  for(const state of [{state:'ready',device_verified:false,login_method:'dev_device'},{state:'totp',device_verified:true,login_method:'dev_device'},{state:'ready',device_verified:true,login_method:'other'},{}]) await assert.rejects(context.requireSessionMfa(state))
  assert.equal(lookups,4)
})
