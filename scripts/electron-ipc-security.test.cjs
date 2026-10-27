const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

function harness() {
  const handlers = new Map()
  const listeners = new Map()
  const opened = []
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/main/trusted-ipc.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  vm.runInNewContext(code, { exports, URL, require(name) {
    assert.equal(name, 'electron')
    return {
      ipcMain: {
        handle: (name, callback) => handlers.set(name, callback),
        on: (name, callback) => listeners.set(name, callback),
        removeHandler: name => handlers.delete(name),
        removeAllListeners: name => listeners.delete(name)
      },
      shell: { openExternal: async url => { opened.push(url) } }
    }
  } })
  const contents = new EventEmitter()
  contents.mainFrame = { url: 'file:///G:/app/out/renderer/index.html' }
  contents.isDestroyed = () => false
  return { ...exports, handlers, listeners, opened, contents,
    event: { sender: contents, senderFrame: contents.mainFrame } }
}

test('trusted renderer URLs reject sibling files, credentials, other origins and schemes', () => {
  const { isTrustedRendererUrl: allows } = harness()
  const file = 'file:///G:/app/out/renderer/index.html'
  assert.equal(allows(file + '?password-recovery=1#recovery', file), true)
  for (const url of ['file:///G:/app/out/renderer/other.html', 'file://evil.test/G:/app/out/renderer/index.html', 'https://evil.test/index.html', 'data:text/html,attack', 'javascript:void(0)', 'invalid']) {
    assert.equal(allows(url, file), false, url)
  }
  const dev = 'http://localhost:5173/'
  assert.equal(allows(dev + 'route?test=1', dev), true)
  for (const url of ['http://localhost:5174/', 'http://localhost.evil.test:5173/', 'https://localhost:5173/', 'http://attacker@localhost:5173/']) {
    assert.equal(allows(url, dev), false, url)
  }
})

test('IPC invokes app handler only from a registered live window and its main frame', () => {
  const h = harness()
  let calls = 0
  h.trustedIpcMain.handle('sensitive:read', (_event, value) => { calls++; return value })
  const invoke = h.handlers.get('sensitive:read')
  assert.throws(() => invoke(h.event, 'private'), /Nguồn yêu cầu/)
  h.registerTrustedRenderer({ webContents: h.contents }, h.contents.mainFrame.url)
  assert.equal(invoke(h.event, 'private'), 'private')
  assert.throws(() => invoke({ ...h.event, senderFrame: { url: h.contents.mainFrame.url } }), /Nguồn yêu cầu/)
  assert.throws(() => invoke({ ...h.event, senderFrame: null }), /Nguồn yêu cầu/)
  h.contents.mainFrame.url = 'https://evil.test/'
  assert.throws(() => invoke(h.event), /Nguồn yêu cầu/)
  h.contents.mainFrame.url = 'file:///G:/app/out/renderer/index.html'
  h.contents.isDestroyed = () => true
  assert.throws(() => invoke(h.event), /Nguồn yêu cầu/)
  assert.equal(calls, 1)
})

test('fire-and-forget IPC and destroyed windows cannot bypass sender checks', () => {
  const h = harness()
  let calls = 0
  h.trustedIpcMain.on('sensitive:event', () => calls++)
  const send = h.listeners.get('sensitive:event')
  send(h.event)
  assert.equal(calls, 0)
  h.registerTrustedRenderer({ webContents: h.contents }, h.contents.mainFrame.url)
  send(h.event)
  assert.equal(calls, 1)
  send({ ...h.event, senderFrame: { url: 'https://evil.test/' } })
  h.contents.emit('destroyed')
  send(h.event)
  assert.equal(calls, 1)
})

test('navigation, redirects and webviews are blocked before leaving the app', () => {
  const h = harness()
  const file = h.contents.mainFrame.url
  h.registerTrustedRenderer({ webContents: h.contents }, file)
  const navigate = url => {
    const event = { prevented: false, preventDefault() { this.prevented = true } }
    h.contents.emit('will-navigate', event, url)
    return event.prevented
  }
  assert.equal(navigate(file + '#section'), false)
  assert.equal(navigate('https://example.com/'), true)
  assert.deepEqual(h.opened, ['https://example.com/'])
  for (const url of ['file:///G:/private.html', 'data:text/html,attack', 'https://user:pass@example.com/']) assert.equal(navigate(url), true)
  assert.equal(h.opened.length, 1)
  const redirect = { prevented: false, preventDefault() { this.prevented = true } }
  h.contents.emit('will-redirect', redirect, 'https://evil.test/', false, true)
  assert.equal(redirect.prevented, true)
  const webview = { prevented: false, preventDefault() { this.prevented = true } }
  h.contents.emit('will-attach-webview', webview)
  assert.equal(webview.prevented, true)
})

test('every main-process IPC registration uses the trusted adapter', () => {
  const root = path.join(__dirname, '../src/main')
  for (const file of fs.readdirSync(root).filter(name => name.endsWith('.ts') && name !== 'trusted-ipc.ts')) {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    if (/ipcMain\.(?:handle|on)\(/.test(source)) {
      assert.match(source, /import \{[^\n]*trustedIpcMain as ipcMain[^\n]*\} from '\.\/trusted-ipc'/, file)
    }
  }
})
