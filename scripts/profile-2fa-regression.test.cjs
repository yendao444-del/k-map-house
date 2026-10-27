const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function harness(file, row, session = {access_token:'fixture-token',user:{id:'self-id'}}) {
  const ast = ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true)
  const names = ['ownSecurityMethods','securityCall','sendSecurityEmailCode','verifySecurityEmailCode']
  const source = ast.statements.filter(s => ts.isFunctionDeclaration(s) && names.includes(s.name?.text)).map(s=>s.getText(ast)).join('\n')
  const calls=[], rpcCalls=[]
  let reply={ok:true,challenge_id:'fixture-challenge',masked_email:'d***@example.invalid'}
  let readError=null
  const context=vm.createContext({exports:{},supabase:{
    auth:{getSession:async()=>({data:{session},error:null})},
    rpc(name,args,opts) {
      const call={name,args,opts}; rpcCalls.push(call)
      return {
        select(columns){call.columns=columns;return this},
        eq(key,value){call.filter={key,value};return this},
        async maybeSingle(){return {data:row,error:readError}}
      }
    }
  },managementSecurity:async(action,data,token)=>{calls.push({action,data,token});return reply}})
  vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context)
  return {api:context.exports,calls,rpcCalls,respond:v=>{reply=v},failRead:()=>{readError={message:'Fixture failure'}}}
}
for(const file of ['src/renderer/src/lib/mfa.ts','adminpwa/src/renderer/src/lib/mfa.ts']) {
  test(file+': self-only projected GET returns account proof',async()=>{
    const h=harness(file,{authenticator_verified:true,email_verified:false})
    assert.deepEqual(JSON.parse(JSON.stringify(await h.api.ownSecurityMethods())),{authenticatorVerified:true,emailVerified:false})
    assert.deepEqual(h.rpcCalls[0].filter,{key:'id',value:'self-id'})
    assert.equal(h.rpcCalls[0].columns,'authenticator_verified,email_verified')
    assert.equal(h.rpcCalls[0].opts.get,true)
    assert.equal(h.rpcCalls[0].name,'management_user_directory')
  })
  test(file+': missing session and unknown/failed data never claim verified',async()=>{
    const missing=harness(file,{},null)
    await assert.rejects(missing.api.ownSecurityMethods());assert.equal(missing.rpcCalls.length,0)
    for(const row of [null,{}, {email_verified:'true',authenticator_verified:true}]) await assert.rejects(harness(file,row).api.ownSecurityMethods())
    const failed=harness(file,{email_verified:true,authenticator_verified:true});failed.failRead();await assert.rejects(failed.api.ownSecurityMethods())
  })
  test(file+': email flow uses session-bound challenge, never a client recipient',async()=>{
    const h=harness(file,{})
    const sent=await h.api.sendSecurityEmailCode('signin')
    assert.equal(sent.challengeId,'fixture-challenge')
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])),{action:'email_send',data:{purpose:'signin'},token:'fixture-token'})
    await h.api.verifySecurityEmailCode('signin',sent.challengeId,' 123456 ')
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls[1].data)),{purpose:'signin',challenge_id:'fixture-challenge',code:'123456'})
    h.respond({ok:false});await assert.rejects(h.api.verifySecurityEmailCode('signin',sent.challengeId,'000000'))
    h.respond({ok:true});await assert.rejects(h.api.sendSecurityEmailCode('signin'))
  })
}
