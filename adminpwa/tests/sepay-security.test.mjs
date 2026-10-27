import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
async function load(name) { const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL(`../backend/functions/admin-pwa-sepay/${name}.ts`, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' }); return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`) }
const policy = await load('policy')
const { createSepayHandler } = await load('handler')
const now = Date.parse('2026-10-08T09:00:00Z')
const adminId = '11111111-1111-4111-8111-111111111111'
const bearer = 'Bearer valid.header.signature'
const origin = 'https://app.phongtroankhang.com'
const valid = { id:'bank-1', reference_number:'REF-1', amount_in:100000, amount_out:0, transaction_content:'P101T102026CINV1', transaction_date:'2026-10-08T15:30:00+07:00', account_number:'123456789' }
test('provider transaction is the only source of amount/account/date', () => { assert.deepEqual(policy.verifyProviderTransaction(valid,'bank-1','123456789',now), { id:'bank-1', reference_number:'REF-1', amount_in:100000, transaction_content:'P101T102026CINV1', transaction_date:'2026-10-08T08:30:00.000Z', account_number:'123456789' }) })
test('provider validation accepts an alphanumeric SePay sub-account after normalization', () => {
  const transaction = { ...valid, account_number: 'MAIN 123', sub_account: ' ab-12 34 ' }
  assert.equal(policy.verifyProviderTransaction(transaction, 'bank-1', 'AB1234', now).account_number, 'AB1234')
  assert.throws(() => policy.verifyProviderTransaction({ ...transaction, sub_account: 'AB1235' }, 'bank-1', 'AB1234', now))
})
test('provider validation rejects spoofed amount, outgoing, account, future, malformed and duplicate request IDs', () => {
  for (const item of [
    {...valid,amount_in:100000.5}, {...valid,amount_out:1}, {...valid,account_number:'999'}, {...valid,transaction_date:'2026-10-08T16:06:00+07:00'}, {...valid,transaction_date:'bad'}, {...valid,transaction_content:'x'.repeat(4001)}, {...valid,reference_number:' '}
  ]) assert.throws(() => policy.verifyProviderTransaction(item,'bank-1','123456789',now), undefined, JSON.stringify(item))
  assert.throws(() => policy.verifyProviderTransaction(valid,'other','123456789',now))
})
function harness({ security=true, securityStatus=200, profiles=[{id:adminId,role:'admin',status:'active'}], provider=[valid], providerStatus=200, rpcStatus=200, rpcBody={invoice:{id:'inv-1'}} }={}) {
  const calls=[]; const handler=createSepayHandler({supabaseUrl:'https://trusted.supabase.co',anonKey:'anon',serviceKey:'service'}, { now:()=>now, fetch:async (url, options={}) => { calls.push({url,options}); if(url.endsWith('/auth/v1/user')) return Response.json({id:adminId}); if(url.includes('/rpc/security_management_access_allowed?')) return Response.json(typeof security === 'function' ? security(new URL(url).searchParams.get('p_sensitive') === 'true') : security,{status:securityStatus}); if(url.includes('/rest/v1/users?')) return Response.json(profiles); if(url.includes('/rest/v1/app_secrets?')) return Response.json([{sepay_api_token:'server-only-token'}]); if(url.includes('/rest/v1/app_settings?')) return Response.json([{account_no:'123456789'}]); if(url==='https://my.sepay.vn/userapi/transactions/list') return Response.json({status:200,transactions:provider},{status:providerStatus}); if(url.includes('/rpc/admin_pwa_reconcile_verified_sepay')) return Response.json(rpcBody,{status:rpcStatus}); throw new Error('unexpected '+url) } }); return {handler,calls}
}
const request = (body={action:'reconcile',transactionId:'bank-1',invoiceId:'inv-1'}, extra={}) => new Request('https://trusted.supabase.co/functions/v1/admin-pwa-sepay',{method:'POST',headers:{authorization:bearer,origin,'content-type':'application/json'},body:JSON.stringify(body),...extra})
test('anonymous, wrong origin, nonadmin and malformed requests fail before payment RPC', async () => {
  const h=harness(); assert.equal((await h.handler(new Request('https://x',{method:'POST',headers:{origin},body:'{}'}))).status,401); assert.equal((await h.handler(new Request('https://x',{method:'POST',headers:{authorization:bearer,origin:'https://evil.test'},body:'{}'}))).status,403)
  const staff=harness({profiles:[{id:adminId,role:'user',status:'active'}]}); assert.equal((await staff.handler(request())).status,403)
  for(const body of [{action:'reconcile',transactionId:'bank-1',invoiceId:'inv-1',amount:1},{action:'reconcile',transactionId:'bank-1'},{action:'bank-receipt',transactionId:'bank-1',invoiceId:'inv-1'},{action:'reconcile',transactionId:'bank-1',invoiceId:'inv-1',accountNumber:'x'}]) assert.equal((await h.handler(request(body))).status,400)
  assert.equal(h.calls.filter(x=>x.url.includes('/rpc/admin')).length,0)
})
test('valid reconciliation verifies provider and sends only verified payload to RPC', async () => { const h=harness(); const response=await h.handler(request()); assert.equal(response.status,200); assert.deepEqual((await response.json()).data.invoice.id,'inv-1'); const rpc=h.calls.find(x=>x.url.includes('/rpc/admin')); const body=JSON.parse(rpc.options.body); assert.equal(body.p_tx.amount_in,100000); assert.equal(body.p_tx.account_number,'123456789'); assert.equal(body.p_invoice_id,'inv-1'); assert.equal(body.p_actor,adminId) })
test('provider failure, duplicate/missing record and RPC failure never claim success', async () => { for(const options of [{provider:[]},{provider:[valid,{...valid,id:'bank-1'}]},{providerStatus:503},{rpcStatus:409,rpcBody:{error:'duplicate'}}]) { const h=harness(options); const response=await h.handler(request()); assert.notEqual(response.status,200); assert.equal((await response.json()).ok,false) } })
test('bank receipt mode contains no invoice and returns server receipt only', async () => { const h=harness({rpcBody:{receiptId:'pwa-sepay-test'}}); const response=await h.handler(request({action:'bank-receipt',transactionId:'bank-1'})); assert.equal(response.status,200); assert.equal((await response.json()).data.receiptId,'pwa-sepay-test') })
test('list action stays on the restricted handler and returns only sanitized provider fields', async () => {
  const h = harness({ provider: [{ ...valid, account_number: '123456789', internal_token: 'must-not-leak' }] })
  const response = await h.handler(request({ action: 'list' }))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.data.transactions.length, 1)
  assert.equal(body.data.transactions[0].account_number, '•••••6789')
  assert.equal(body.data.transactions[0].internal_token, undefined)
  assert.equal(h.calls.filter(call => call.url.includes('/rpc/admin_pwa_reconcile_verified_sepay')).length, 0)
})
test('list action rejects transaction identifiers and arbitrary fields', async () => {
  const h = harness()
  assert.equal((await h.handler(request({ action: 'list', transactionId: 'bank-1' }))).status, 400)
  assert.equal((await h.handler(request({ action: 'list', extra: 'x' }))).status, 400)
})

 test('unverified MFA or an unavailable security guard denies SePay before privileged reads and provider calls', async () => {
  for (const options of [{security:false},{securityStatus:403},{securityStatus:503}]) {
    const h=harness(options); assert.equal((await h.handler(request())).status,options.securityStatus === 503 ? 503 : 403);
    assert.equal(h.calls.filter(c=>!c.url.endsWith('/auth/v1/user')&&!c.url.includes('/rpc/security_management_access_allowed?')).length,0);
    const guard=h.calls.find(c=>c.url.includes('/rpc/security_management_access_allowed?'));
    assert.equal(guard.options.headers.Authorization,bearer); assert.equal(guard.options.headers.apikey,'anon');
    assert.equal(guard.options.method,'GET');
    assert.equal(new URL(guard.url).searchParams.get('p_sensitive'),'true');
  }
})

test('authorized AAL2 session outside the recent-MFA window can list but cannot post money', async () => {
  const h=harness({security:sensitive=>!sensitive})
  assert.equal((await h.handler(request({action:'list'}))).status,200)
  const read=h.calls.find(c=>c.url.includes('/rpc/security_management_access_allowed?'))
  assert.equal(read.options.method,'GET')
  assert.equal(new URL(read.url).searchParams.get('p_sensitive'),'false')
  for (const body of [{action:'reconcile',transactionId:'bank-1',invoiceId:'inv-1'}, {action:'bank-receipt',transactionId:'bank-1'}]) {
    const write=harness({security:sensitive=>!sensitive})
    assert.equal((await write.handler(request(body))).status,403)
    assert.equal(write.calls.some(c=>c.url.includes('/rest/v1/app_secrets')||c.url.includes('/rpc/admin_pwa_reconcile_verified_sepay')),false)
  }
})

test('list still denies unverified/expired sessions and guard outages before reading secrets', async () => {
  for (const options of [{security:false},{securityStatus:403},{securityStatus:503}]) {
    const h=harness(options)
    assert.equal((await h.handler(request({action:'list'}))).status,options.securityStatus === 503 ? 503 : 403)
    assert.equal(h.calls.some(c=>c.url.includes('/rest/v1/users?')||c.url.includes('/rest/v1/app_secrets')||c.url.includes('my.sepay.vn')),false)
  }
})
