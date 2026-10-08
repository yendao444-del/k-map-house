const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { test } = require('node:test')

test('tenant repository preserves name accents, leading zero and both-face archive', async () => {
  let inserted
  const supabase = { from(table) {
    assert.equal(table, 'tenants')
    return { insert(data) { inserted = data; return { select() { return { single: async () => ({ data, error: null }) } } } } }
  }}
  const source = fs.readFileSync('src/renderer/src/lib/db.ts','utf8')
  const js = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
  const exports = {}
  vm.runInNewContext(js,{exports,require(name){
    if(name==='./supabase') return {supabase,safeQuery:async fn=>(await fn()).data}
    return {}
  },crypto:require('node:crypto').webcrypto,Date,Set,Map,console})
  const result = await exports.createTenant({full_name:'Đỗ Mỹ Duyên',identity_card:'001200000123',identity_image_url:'data:image/jpeg;base64,archive-two-faces',phone:'0912345678',email:'tenant@example.com',address:'Hà Nội',id_card_issued_date:'2025-11-24',is_active:false})
  assert.equal(result.full_name,'Đỗ Mỹ Duyên')
  assert.equal(inserted.identity_card,'001200000123')
  assert.equal(inserted.identity_image_url,'data:image/jpeg;base64,archive-two-faces')
  assert.equal(inserted.address,'Hà Nội')
  assert.equal(inserted.id_card_issued_date,'2025-11-24')
  assert.equal(result.is_active,true)
  assert.ok(result.id)
})
