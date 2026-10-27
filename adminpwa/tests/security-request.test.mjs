import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

async function moduleAt(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInNewContext(js, { exports, require: name => imports[name], fetch, AbortSignal, setTimeout, clearTimeout, Error, Promise })
  return exports
}

for (const [name, root] of [['desktop', '../../src/renderer/src/lib/'], ['pwa', '../src/renderer/src/lib/']]) {
  const helpers = await moduleAt(root + 'security-request.ts')
  test(name + ': hung SDK reads fail, then a new read succeeds', async () => {
    await assert.rejects(helpers.securityRead(() => new Promise(() => {}), 15), /Kết nối bảo mật/)
    assert.equal(await helpers.securityRead(() => Promise.resolve('ready'), 100), 'ready')
    await assert.rejects(helpers.securityRead(() => Promise.reject(new Error('denied')), 100), /denied/)
  })
  test(name + ': stalled response body is aborted after headers arrive', async () => {
    const server = createServer((_, response) => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.write('{"ok":') })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const response = await helpers.securityFetch(`http://127.0.0.1:${server.address().port}`, undefined, 150)
      await assert.rejects(response.json())
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  })
  test(name + ': caller cancellation remains effective', async () => {
    const controller = new AbortController(); controller.abort()
    await assert.rejects(helpers.securityFetch('http://127.0.0.1:1', { signal: controller.signal }, 100))
  })
  test(name + ': SDK timeout cannot create an OTP or perform a protected action', async () => {
    const calls = []
    let hangs = true
    const client = await moduleAt(root + 'mfa.ts', {
      './supabase': { supabase: { auth: { getSession: () => hangs ? new Promise(() => {}) : Promise.resolve({ data: { session: { access_token: 'fixture' } } }) } } },
      './security-request': { securityRead: read => helpers.securityRead(read, 15) },
      './management-auth-client': { managementSecurity: async action => { calls.push(action); return { ok: true, challenge_id: 'fixture' } } }
    })
    await assert.rejects(client.beginTotpChallenge('factor'), /Kết nối bảo mật/)
    assert.deepEqual(calls, [])
    hangs = false
    assert.equal(await client.beginTotpChallenge('factor'), 'fixture')
    assert.deepEqual(calls, ['totp_challenge'])
  })
}

test('desktop Ctrl+R recovery works even when the toolkit prevented its default action', async () => {
  const source = await readFile(new URL('../../src/main/index.ts', import.meta.url), 'utf8')
  const start = source.indexOf("mainWindow.webContents.on('before-input-event'")
  const end = source.indexOf('\n  })', start) + 5
  let callback, reloads = 0, prevented = 0
  const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(js, { mainWindow: { webContents: { on: (_, fn) => { callback = fn }, reload: () => { reloads++ } } } })
  const event = { defaultPrevented: true, preventDefault: () => { prevented++ } }
  callback(event, { type: 'keyDown', code: 'KeyR', control: true })
  assert.equal(reloads, 1); assert.equal(prevented, 1)
  callback(event, { type: 'keyUp', code: 'KeyR', control: true })
  callback(event, { type: 'keyDown', code: 'KeyR' })
  callback(event, { type: 'keyDown', code: 'KeyR', control: true, alt: true })
  assert.equal(reloads, 1)
})
