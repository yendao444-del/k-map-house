import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
async function moduleFrom(file) {
  const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL(`../src/renderer/src/lib/${file}.ts`, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}
const auth = await moduleFrom('management-auth-policy')
const finance = await moduleFrom('mobile-room-finance')
const filter = await moduleFrom('mobile-room-filter')
const summary = await moduleFrom('room-list-summary')
const invoiceState = await moduleFrom('mobile-invoice-state')
const now = new Date(2026, 9, 8)
const room = { id: 'r1', name: 'Phòng 151', status: 'occupied', base_rent: 2900000 }
const contract = { id: 'c1', tenant_id: 't1', created_at: '2026-09-01', move_in_date: '2026-09-01' }
const invoice = { id: 'i1', room_id: 'r1', tenant_id: 't1', year: 2026, month: 10, total_amount: 3551000, paid_amount: 0, payment_status: 'unpaid', created_at: '2026-10-01' }
const calculate = (items, r = room, c = contract) => finance.getMobileRoomFinance(r, c, items, now)
const all = { occupied: false, vacant: false, ending: false, expiring: false }

test('management accepts the old admin and staff roles with exact active profile ID', () => {
  for (const role of ['admin', 'user']) assert.doesNotThrow(() => auth.assertManagementProfile({ id: 'auth-id', role, status: 'active' }, 'auth-id'))
})
for (const [name, profile] of Object.entries({ missing: null, inactive: { id: 'u', role: 'admin', status: 'inactive' }, missingStatus: { id: 'u', role: 'admin' }, tenant: { id: 'u', role: 'tenant', status: 'active' }, missingRole: { id: 'u', status: 'active' }, otherId: { id: 'other', role: 'admin', status: 'active' } })) {
  test(`management fails closed for ${name}`, () => assert.throws(() => auth.assertManagementProfile(profile, 'u')))
}
test('unpaid current balance comes from real period and amount', () => {
  const result = calculate([invoice]); assert.equal(result.label, 'Chưa thu tháng 10'); assert.equal(result.balance, 3551000); assert.equal(result.totalDebt, 3551000)
})
test('partial amount is not marked collected', () => { const result = calculate([{ ...invoice, payment_status: 'partial', paid_amount: 2000000 }]); assert.equal(result.balance, 1551000); assert.equal(result.label, 'Còn thiếu tháng 10') })
test('current balance is separate from total debt over multiple periods', () => {
  const result = calculate([invoice, { ...invoice, id: 'i2', month: 9, created_at: '2026-09-05', total_amount: 1000000 }]); assert.equal(result.balance, 3551000); assert.equal(result.totalDebt, 4551000)
})
test('old tenants never contribute to current room debt', () => assert.equal(calculate([invoice, { ...invoice, id: 'old', tenant_id: 'old-tenant', total_amount: 9000000 }]).totalDebt, 3551000))
test('vacant room never shows debt of the previous tenant', () => { const result = calculate([invoice], { ...room, status: 'vacant' }); assert.equal(result.totalDebt, 0); assert.equal(result.kind, 'vacant') })
test('cancelled and merged invoices are not receivables', () => assert.equal(calculate([{ ...invoice, payment_status: 'cancelled' }, { ...invoice, payment_status: 'merged' }]).totalDebt, 0))
test('no invoice does not imply paid', () => assert.equal(calculate([]).kind, 'pending'))
test('a paid old period does not imply current month paid', () => assert.equal(calculate([{ ...invoice, month: 9, payment_status: 'paid', paid_amount: invoice.total_amount }]).kind, 'pending'))
test('paid current invoice shows collected', () => assert.equal(calculate([{ ...invoice, payment_status: 'paid', paid_amount: invoice.total_amount }]).kind, 'paid'))
test('negative settlement needs refund, not paid or debt', () => { const result = calculate([{ ...invoice, total_amount: -500000, is_settlement: true }]); assert.equal(result.kind, 'refund'); assert.equal(result.balance, 500000) })
test('confirmed debt remains separate from invoice action', () => { const result = calculate([{ ...invoice, debt_confirmed_at: '2026-10-02' }]); assert.equal(result.kind, 'debt'); assert.equal(result.totalDebt, invoice.total_amount) })
test('different year is displayed to disambiguate the debt period', () => assert.equal(calculate([{ ...invoice, year: 2025 }], room, undefined).label, 'Chưa thu tháng 10/2025'))
test('first month remains first-month collection', () => assert.equal(calculate([{ ...invoice, is_first_month: true }]).label, 'Chưa thu tháng đầu'))
test('partially paid first month is labeled remaining instead of wholly unpaid', () => assert.equal(calculate([{ ...invoice, is_first_month: true, payment_status: 'partial', paid_amount: 1000000 }]).label, 'Còn thiếu tháng đầu'))
for (const reason of ['deposit_collect', 'deposit_refund']) {
  test(`paid ${reason} alone does not mean monthly rent is collected`, () => assert.equal(calculate([{ ...invoice, billing_reason: reason, payment_status: 'paid', paid_amount: invoice.total_amount }]).kind, 'pending'))
}
test('legacy amount-only deposit invoice is not monthly collection', () => assert.equal(calculate([{ ...invoice, deposit_amount: invoice.total_amount, payment_status: 'paid', paid_amount: invoice.total_amount }]).kind, 'pending'))
test('unpaid deposit is identified separately from monthly rent', () => assert.equal(calculate([{ ...invoice, billing_reason: 'deposit_collect' }]).label, 'Chưa thu tiền cọc'))
test('partial deposit clearly identifies the missing deposit', () => assert.equal(calculate([{ ...invoice, billing_reason: 'deposit_collect', payment_status: 'partial', paid_amount: 1000000 }]).label, 'Còn thiếu tiền cọc'))
test('settlement label is distinct', () => assert.equal(calculate([{ ...invoice, is_settlement: true }]).label, 'Còn nợ tất toán'))
test('filters accept continuous list without floor dependence', () => assert.equal(filter.matchesRoomFilter({ ...room, floor: 99 }, all, '151', false), true))
test('multiple status filters are combined as OR', () => assert.equal(filter.matchesRoomFilter(room, { ...all, occupied: true, vacant: true }, '', false), true))
test('expired filter is functional, not the zero-result Electron defect', () => assert.equal(filter.matchesRoomFilter(room, { ...all, expiring: true }, '', true), true))
test('search is trimmed and case-insensitive in Vietnamese', () => assert.equal(filter.matchesRoomFilter(room, all, ' PHÒNG 151 ', false), true))
test('expired contract filter uses dates, excludes vacant and maintenance', () => {
  assert.equal(filter.isRoomExpired(room, { ...contract, expiration_date: '2026-10-08' }, now), true)
  assert.equal(filter.isRoomExpired(room, { ...contract, expiration_date: '2026-10-09' }, now), false)
  assert.equal(filter.isRoomExpired({ ...room, status: 'vacant' }, { expiration_date: '2026-09-01' }, now), false)
})
test('no payment permits cancellation; partial payment prevents it', () => {
  assert.equal(summary.getRoomListSummary([invoice], contract, 0).canCancel, true)
  assert.equal(summary.getRoomListSummary([{ ...invoice, paid_amount: 1, payment_status: 'partial' }], contract, 0).canCancel, false)
})
test('history prevents deletion even if invoices are settled', () => assert.equal(summary.getRoomListSummary([{ ...invoice, payment_status: 'paid', paid_amount: invoice.total_amount }], contract, 0).canDeleteRoom, false))
test('shell worker only caches whitelisted public paths', async () => {
  const worker = await readFile(new URL('../scripts/service-worker.template.js', import.meta.url), 'utf8')
  assert.match(worker, /url\.origin !== self\.location\.origin/); assert.match(worker, /url\.search/); assert.match(worker, /headers\.has\('authorization'\)/); assert.match(worker, /!allowed\.has\(url\.pathname\)/)
})
test('production has no visual harness/auth bypass', async () => {
  const main = await readFile(new URL('../src/renderer/src/main.tsx', import.meta.url), 'utf8')
  assert.match(main, /import\.meta\.env\.DEV \? lazy/)
  assert.match(main, /qaRoomsRequested = import\.meta\.env\.DEV/)
})

test('negative invoice requests a refund, never shows collected', () => {
  const state = invoiceState.getMobileInvoiceState({ ...invoice, total_amount: -500000 })
  assert.equal(state.label, 'Cần hoàn tiền'); assert.equal(state.amount, 500000)
  assert.equal(state.actionLabel, 'Hoàn tiền'); assert.equal(state.canPay, true)
})
test('partial signed refund shows only the remainder', () => {
  const state = invoiceState.getMobileInvoiceState({ ...invoice, total_amount: -500000, paid_amount: -200000, payment_status: 'partial' })
  assert.equal(state.label, 'Hoàn còn thiếu'); assert.equal(state.amount, 300000)
})
test('completed signed refund does not expose another payment', () => {
  const state = invoiceState.getMobileInvoiceState({ ...invoice, total_amount: -500000, paid_amount: -500000, payment_status: 'paid' })
  assert.equal(state.label, 'Đã hoàn đủ'); assert.equal(state.amount, 0); assert.equal(state.canPay, false)
})
for (const payment_status of ['merged', 'cancelled']) {
  test(`${payment_status} overrides settlement and confirmed debt, preventing all money actions`, () => {
    const item = { ...invoice, payment_status, is_settlement: true, debt_confirmed_at: '2026-10-08' }
    assert.equal(invoiceState.getMobileInvoiceState(item).amount, 0)
    assert.deepEqual(invoiceState.getInvoiceMenuPermissions(item, true), { canPay: false, canEdit: false, canCancel: false, canReopen: false })
  })
}
test('confirmed debt permits collection but only admin can reopen without a payment', () => {
  const item = { ...invoice, debt_confirmed_at: '2026-10-08' }
  assert.equal(invoiceState.getMobileInvoiceState(item).label, 'Đã chốt · Đang nợ')
  assert.deepEqual(invoiceState.getInvoiceMenuPermissions(item, false), { canPay: true, canEdit: false, canCancel: false, canReopen: false })
  assert.equal(invoiceState.getInvoiceMenuPermissions(item, true).canReopen, true)
  assert.equal(invoiceState.getInvoiceMenuPermissions({ ...item, paid_amount: 1 }, true).canReopen, false)
})
test('paid invoice edit/cancel retains Electron admin guard', () => {
  const item = { ...invoice, paid_amount: invoice.total_amount, payment_status: 'paid' }
  assert.equal(invoiceState.getInvoiceMenuPermissions(item, false).canEdit, false)
  assert.equal(invoiceState.getInvoiceMenuPermissions(item, false).canCancel, false)
  assert.equal(invoiceState.getInvoiceMenuPermissions(item, true).canEdit, true)
})
test('zero balance without paid status is not falsely labeled collected', () => {
  const state = invoiceState.getMobileInvoiceState({ ...invoice, total_amount: 0 })
  assert.equal(state.label, 'Không còn số dư'); assert.equal(state.canPay, false)
})
test('settlement and deposit refund use signed balances without changing permissions', () => {
  for (const extra of [{ is_settlement: true }, { billing_reason: 'deposit_refund' }]) {
    const state = invoiceState.getMobileInvoiceState({ ...invoice, ...extra, total_amount: -800000, paid_amount: -300000, payment_status: 'partial' })
    assert.equal(state.amount, 500000); assert.equal(state.canPay, true)
  }
})
test('mobile menu position stays inside 320px viewport including bottom row', () => {
  const position = invoiceState.getInvoiceMenuPosition({ bottom: 810, right: 318 }, 320, 844)
  assert.equal(position.right, 8); assert.equal(position.top, 576)
  const small = invoiceState.getInvoiceMenuPosition({ bottom: 5, right: 2 }, 320, 240)
  assert.equal(small.top, 8); assert.equal(small.right, 136)
})
