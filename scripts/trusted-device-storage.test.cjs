const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const path = require('node:path')
const source = fs.readFileSync(path.join(__dirname,'../src/main/trusted-device.ts'),'utf8')
const token = 'a'.repeat(64)+'.'+'b'.repeat(64)
function harness(encryption = true) {
  const handlers = new Map(), files = new Map()
  const context = {
    exports: {}, require: name => {
      if (name === 'electron') return { app: { getPath: ()=>'fixture-profile' }, safeStorage: {
        isEncryptionAvailable:()=>encryption,
        encryptString:plain=>Buffer.from('encrypted:'+plain), decryptString:bytes=>bytes.toString().slice(10)
      } }
      if (name === './trusted-ipc') return { trustedIpcMain: { handle:(name,fn)=>handlers.set(name,fn) } }
      if (name === 'node:path') return path
      if (name === 'node:fs') return { existsSync:p=>files.has(p), readFileSync:p=>files.get(p), writeFileSync:(p,v)=>files.set(p,v), mkdirSync:()=>{}, unlinkSync:p=>files.delete(p) }
      throw new Error(name)
    }
  }
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context)
  context.exports.registerTrustedDevice()
  return {handlers,files}
}
test('native trusted credential is encrypted and can be read/cleared across renderer origins',()=>{
  const h=harness();assert.equal(h.handlers.get('trustedDevice:read')(),null)
  assert.equal(h.handlers.get('trustedDevice:write')({},token),true)
  assert.equal([...h.files.values()][0].toString(),'encrypted:'+token)
  assert.equal(h.handlers.get('trustedDevice:read')(),token)
  h.handlers.get('trustedDevice:clear')();assert.equal(h.handlers.get('trustedDevice:read')(),null)
})
test('no plaintext fallback when OS encryption is unavailable or token is malformed',()=>{
  const unavailable=harness(false)
  assert.throws(()=>unavailable.handlers.get('trustedDevice:write')({},token),/mã hóa/)
  assert.equal(unavailable.files.size,0)
  const valid=harness()
  for(const value of [null,{},'invalid',token+'extra']) assert.throws(()=>valid.handlers.get('trustedDevice:write')({},value),/không hợp lệ/)
  assert.equal(valid.files.size,0)
})
