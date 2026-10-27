const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

for (const base of ['src/renderer/src', 'adminpwa/src/renderer/src']) {
  function harness(failure) {
    const source = fs.readFileSync(base + '/lib/db.ts', 'utf8')
    const projection = source.slice(source.indexOf('const ROOM_LIST_SELECT ='), source.indexOf('const USER_PROFILE_SELECT ='))
    const fn = source.slice(source.indexOf('export const getRooms ='), source.indexOf('export const getRoom ='))
    const calls = []
    const rooms = [{ id: 'fixture-room', name: 'Test', status: 'vacant', expected_end_date: '2032-01-01', tenant_name: 'Fixture' }]
    const context = vm.createContext({ exports: {}, console: { warn() {} },
      safeQuery: async query => query(),
      supabase: { from: table => ({ select: selection => ({ order: async () => {
        calls.push({ table, selection })
        if (calls.length === 1 && failure) throw new Error(failure)
        return rooms
      } }) }) }
    })
    vm.runInContext(ts.transpileModule(projection + fn, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
    return { getRooms: context.exports.getRooms, calls }
  }

  test(base + ' loads rooms from an older schema missing optional price columns', async () => {
    const h = harness('column rooms.electric_price does not exist')
    const rooms = await h.getRooms()
    assert.equal(rooms.length, 1)
    assert.equal(rooms[0].status, 'ending')
    assert.match(h.calls[0].selection, /electric_price/)
    assert.equal(h.calls[1].selection, '*')
  })

  test(base + ' keeps the compact projection when the schema supports it', async () => {
    const h = harness()
    await h.getRooms()
    assert.equal(h.calls.length, 1)
    assert.notEqual(h.calls[0].selection, '*')
  })

  test(base + ' does not mask permission or network errors with a schema fallback', async () => {
    for (const failure of ['permission denied for table rooms', 'Failed to fetch']) {
      const h = harness(failure)
      await assert.rejects(h.getRooms(), error => error.message === failure)
      assert.equal(h.calls.length, 1)
    }
  })
}
