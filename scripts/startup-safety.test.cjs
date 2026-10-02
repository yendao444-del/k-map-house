const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

function load(relativePath, context) {
  const source = fs.readFileSync(require('node:path').join(__dirname, '..', relativePath), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText
  const exports = {}
  vm.runInNewContext(js, { exports, ...context })
  return exports
}

test('packaged Gmail IPC exists and never loads Google or reads dev tokens', async () => {
  const handlers = new Map()
  let googleLoads = 0
  const gmail = load('src/main/gmail-dev.ts', {
    require(name) {
      if (name === 'electron') return {
        app: { isPackaged: true }, ipcMain: {
          removeHandler: name => handlers.delete(name),
          handle: (name, fn) => handlers.set(name, fn)
        }
      }
      if (name === 'node:fs') return { existsSync() { throw new Error('Unexpected token read') } }
      if (name === 'googleapis') { googleLoads++; throw new Error('Unexpected SDK import') }
      return require(name)
    }
  })
  gmail.registerDevGmailHandlers()
  assert.equal(handlers.size, 3)
  assert.equal(handlers.get('gmail:getAvailability')().available, false)
  assert.equal((await handlers.get('gmail:reauthenticate')()).ok, false)
  assert.equal((await handlers.get('gmail:sendNotification')(null, {})).ok, false)
  assert.equal(googleLoads, 0)
})

test('dev Gmail remains registered, availability does not load Google SDK', () => {
  const handlers = new Map()
  const gmail = load('src/main/gmail-dev.ts', {
    require(name) {
      if (name === 'electron') return {
        app: { isPackaged: false, getPath: () => 'mock-profile' }, ipcMain: {
          removeHandler: name => handlers.delete(name),
          handle: (name, fn) => handlers.set(name, fn)
        }
      }
      if (name === 'node:fs') return { existsSync: () => false }
      if (name === 'googleapis') throw new Error('Unexpected SDK import')
      return require(name)
    }
  })
  gmail.registerDevGmailHandlers()
  const available = handlers.get('gmail:getAvailability')()
  assert.equal(available.available, true)
  assert.equal(available.authenticated, false)
})

test('paint milestone waits two frames, deduplicates, and cancels on unmount', () => {
  const callbacks = new Map()
  const marks = []
  let id = 0
  const perf = load('src/renderer/src/lib/startup-perf.ts', {
    window: { api: { perf: { markStartup: name => marks.push(name) } } },
    requestAnimationFrame(fn) { callbacks.set(++id, fn); return id },
    cancelAnimationFrame(frame) { callbacks.delete(frame) }
  })
  const tick = () => {
    const frame = [...callbacks]
    callbacks.clear()
    frame.forEach(([, fn]) => fn())
  }
  perf.markAfterPaint('renderer-painted')
  assert.equal(marks.length, 0)
  tick()
  assert.equal(marks.length, 0)
  tick()
  assert.deepEqual(marks, ['renderer-painted'])
  perf.markStartup('renderer-painted')
  assert.equal(marks.length, 1)
  const cancel = perf.markAfterPaint('cancelled')
  tick()
  cancel()
  tick()
  assert.equal(marks.length, 1)
})

test('rooms readiness cannot pass on an error or before required data succeeds', () => {
  const source = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/src/App.tsx'), 'utf8')
  const expression = source.match(/const primaryDataReady = ([\s\S]*?)\n  useEffect\(/)[1]
  const ready = {
    canLoadData: true, roomsSuccess: true, invoicesSuccess: true,
    contractsSuccess: true, serviceZonesSuccess: true, receiptsSuccess: true,
    settingsSuccess: true, workflowSuccess: true, rooms: [{ id: 'fixture' }]
  }
  const evaluate = values => vm.runInNewContext(expression, values)
  assert.equal(evaluate(ready), true)
  for (const key of Object.keys(ready).filter(key => key !== 'rooms')) {
    assert.equal(evaluate({ ...ready, [key]: false }), false, key)
  }
  assert.equal(evaluate({ ...ready, rooms: [], workflowSuccess: false }), true)
})

test('benchmark sets Electron paths explicitly and rejects unsafe profile targets', () => {
  const source = fs.readFileSync(require('node:path').join(__dirname, '../src/main/index.ts'), 'utf8')
  const setup = source.slice(source.indexOf('const benchmarkMode ='), source.indexOf('interface DBState'))
  const js = ts.transpileModule(setup, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const paths = require('node:path').win32
  const target = 'C:\\Temp\\dbyhome-bench-' + 'a'.repeat(32)
  const applied = []
  const context = profile => ({
    ...paths, tmpdir: () => 'C:\\Temp',
    process: { env: { KMAP_BENCHMARK: '1', KMAP_BENCHMARK_PROFILE: profile } },
    mkdirSync() {}, app: { setPath: (...args) => applied.push(args) }
  })
  vm.runInNewContext(js, context(target))
  assert.deepEqual(applied.map(([name]) => name), ['appData', 'userData', 'sessionData', 'temp'])
  assert.equal(applied[1][1], paths.join(target, 'user-data'))
  for (const bad of ['C:\\Users\\Admin', 'C:\\Temp\\other', undefined]) {
    assert.throws(() => vm.runInNewContext(js, context(bad)), /isolated profile/)
  }
})

test('benchmark never restores an authenticated session or auto-posts SePay', () => {
  const source = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/src/App.tsx'), 'utf8').replace(/\r\n/g, '\n')
  const effects = [
    source.slice(source.indexOf('  useEffect(() => {\n    if (window.api?.perf.benchmarkMode)'), source.indexOf('\n  }, [passwordRecovery])') + '\n  }, [passwordRecovery])'.length),
    source.slice(source.indexOf('  useEffect(() => {\n    if (window.api?.perf.benchmarkMode || sepayBackgroundMatches'), source.indexOf('\n  }, [queryClient, sepayBackgroundMatches])') + '\n  }, [queryClient, sepayBackgroundMatches])'.length)
  ]
  let ready = false
  for (const effect of effects) {
    assert.ok(effect.startsWith('  useEffect('))
    const js = ts.transpileModule(effect, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(js, {
      window: { api: { perf: { benchmarkMode: true } } },
      useEffect: callback => callback(), setAuthReady: value => { ready = value },
      passwordRecovery: false, queryClient: {}, sepayBackgroundMatches: [{}],
      getCurrentSessionUser() { throw new Error('Live session accessed') },
      recordInvoicePayment() { throw new Error('Live payment posted') }
    })
  }
  assert.equal(ready, true)
})

test('optional main services are deferred until after the first window path', () => {
  const source = fs.readFileSync(require('node:path').join(__dirname, '../src/main/index.ts'), 'utf8').replace(/\r\n/g, '\n')
  const staticImports = source.split('\n').filter(line => /^import .* from '\.\/(market-crawler|fund-nav|update-handlers|telegram-ultraviewer)'/.test(line))
  assert.deepEqual(staticImports, [])
  assert.ok(source.indexOf('createWindow()') < source.indexOf("import('./update-handlers')"))
  assert.ok(source.includes("import('./market-crawler')"))
  assert.ok(source.includes("import('./fund-nav')"))
})
