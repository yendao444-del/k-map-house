const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function controller(base, requirePassword) {
  const file = base + '/components/InvestmentsTab.tsx'
  const source = fs.readFileSync(file, 'utf8')
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let declaration
  const visit = node => {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(tree) === 'commitWalletChange')) declaration = node
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert.ok(declaration)
  const code = ts.transpileModule(declaration.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const log = []
  const context = {
    loading: false, loadError: '', userRole: 'admin', requirePassword,
    commitInvestmentWallet: async options => { log.push('commit'); await options.preparePurchase(); await options.persist(options.nextStore) },
    prepareInvestmentPurchase: async options => {
      log.push('prepare')
      assert.equal(await options.confirm({ shortfall: 8330000, purchaseAmount: 13330000 }), true)
      return { store: options.nextStore }
    },
    getWalletBalanceSummary: async () => { log.push('balance'); return {} },
    readInvestmentStore: async () => { log.push('read-current'); return { data: {} } }, store: {},
    createCashTransaction: async () => { log.push('posting'); return { id: 'fixture' } },
    deleteCashTransaction: async () => { log.push('remove') },
    persist: async () => { log.push('persist') },
    queryClient: { invalidateQueries: () => { log.push('invalidate') } },
    setWalletSummary: () => { log.push('refresh') }, setTransactionError: () => {}, txLabel: {}
  }
  const run = new Function(...Object.keys(context), code + '\nreturn commitWalletChange;')(...Object.values(context))
  return { run: () => run(undefined, undefined, {}), log, source }
}

for (const base of ['src/renderer/src', 'adminpwa/src/renderer/src']) {
  test(base + ': a pending password confirmation prevents wallet writes and persistence', async () => {
    let approve
    const pending = new Promise(resolve => { approve = resolve })
    const h = controller(base, () => pending)
    const done = h.run()
    await Promise.resolve()
    assert.deepEqual(h.log, [])
    approve()
    await done
    assert.ok(h.log.includes('persist'))
  })

  test(base + ': cancellation, bad password/session and unavailable security never commit', async () => {
    for (const message of ['Đã hủy thao tác.', 'Mật khẩu hiện tại không đúng.', 'Phiên bảo mật đã hết hạn.', 'Không thể kết nối dịch vụ xác minh.']) {
      const h = controller(base, async () => { throw Error(message) })
      await assert.rejects(h.run(), { message })
      assert.deepEqual(h.log, [])
    }
  })

  test(base + ': recent confirmation proceeds once and renders the existing password portal', async () => {
    let confirmations = 0
    const h = controller(base, async title => { assert.equal(title, 'Ghi giao dịch đầu tư'); confirmations++ })
    await h.run()
    assert.equal(confirmations, 1)
    assert.equal(h.log.filter(value => value === 'persist').length, 1)
    assert.match(h.source, /import \{ usePasswordConfirmation \} from '\.\/PasswordConfirmationDialog'/)
    assert.match(h.source, /\{passwordConfirmation\}/)
    assert.doesNotMatch(h.source, /useInvestmentFundingConfirmation|\{confirmationDialog\}|confirmTopUp/)
    assert.ok(h.log.indexOf('prepare') < h.log.indexOf('persist'))
  })
}
