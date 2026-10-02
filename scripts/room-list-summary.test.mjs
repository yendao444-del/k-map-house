import assert from 'node:assert/strict'
import { test } from 'node:test'
import AdmZip from 'adm-zip'
import { getRoomListSummary } from '../src/renderer/src/lib/room-list-summary.ts'

function legacySummary(invoices, activeContract, moveInReceiptCount) {
  const roomInvoices = invoices.filter(
    (i) => i.payment_status !== 'cancelled' && i.payment_status !== 'merged'
  )
  const checkInvoices = invoices.filter(
    (i) =>
      (!activeContract?.tenant_id || i.tenant_id === activeContract.tenant_id) &&
      new Date(i.created_at || i.invoice_date || activeContract?.created_at || Date.now()).getTime() >=
        new Date(activeContract?.created_at || activeContract?.move_in_date || Date.now()).getTime()
  )
  const endingOutstandingInvoice =
    checkInvoices
      .filter(
        (i) =>
          i.payment_status !== 'cancelled' &&
          i.payment_status !== 'merged' &&
          (i.payment_status === 'unpaid' || i.payment_status === 'partial')
      )
      .sort((a, b) => {
        if (!!a.is_first_month !== !!b.is_first_month) return a.is_first_month ? -1 : 1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })[0] || null
  const unpaidFirstMonthForCurrentTenant = checkInvoices.find(
    (i) => i.is_first_month && i.payment_status === 'unpaid' && (i.paid_amount || 0) === 0
  )
  const canCancel =
    activeContract &&
    !checkInvoices.some(
      (i) =>
        i.payment_status !== 'cancelled' &&
        i.payment_status !== 'merged' &&
        (i.payment_status === 'paid' || i.payment_status === 'partial' || i.paid_amount > 0)
    )
  const hasStartedInvoice = checkInvoices.some((i) => {
    if (i.payment_status === 'cancelled' || i.payment_status === 'merged') return false
    if (i.is_settlement || i.billing_reason === 'contract_end') return false
    if (i.is_first_month) return true
    if (i.payment_status !== 'paid' && Number(i.paid_amount || 0) <= 0) return false
    return (
      Number(i.room_cost || 0) > 0 ||
      Number(i.electric_cost || 0) > 0 ||
      Number(i.water_cost || 0) > 0 ||
      Number(i.wifi_cost || 0) > 0 ||
      Number(i.garbage_cost || 0) > 0
    )
  })

  return {
    endingOutstandingInvoice,
    unpaidFirstMonthForCurrentTenant,
    canCancel: Boolean(canCancel),
    canDeleteRoom: roomInvoices.length === 0 && moveInReceiptCount === 0,
    hasStartedBilling: hasStartedInvoice || activeContract?.is_migration === true
  }
}

test('room summary preserves first-month, payment and deletion decisions', () => {
  const contract = { id: 'contract', room_id: 'room', tenant_id: 'tenant', created_at: '2026-01-01' }
  const invoices = [
    { id: 'cancelled', tenant_id: 'tenant', created_at: '2026-01-04', payment_status: 'cancelled' },
    { id: 'old', tenant_id: 'tenant', created_at: '2025-12-31', payment_status: 'paid' },
    { id: 'first', tenant_id: 'tenant', created_at: '2026-01-02', payment_status: 'unpaid', is_first_month: true, paid_amount: 0 },
    { id: 'regular', tenant_id: 'tenant', created_at: '2026-01-03', payment_status: 'partial', paid_amount: 100 }
  ]
  const actual = getRoomListSummary(invoices, contract, 0)
  assert.equal(actual.endingOutstandingInvoice?.id, 'first')
  assert.equal(actual.unpaidFirstMonthForCurrentTenant?.id, 'first')
  assert.equal(actual.canCancel, false)
  assert.equal(actual.canDeleteRoom, false)
  assert.equal(actual.hasStartedBilling, true)
  assert.deepEqual(actual, legacySummary(invoices, contract, 0))
})

test('a paid monthly invoice also marks an older contract as started', () => {
  const contract = {
    id: 'contract-351',
    room_id: 'room-351',
    tenant_id: 'tenant-351',
    created_at: '2026-06-07T15:42:10.162+07:00',
    move_in_date: '2026-06-07',
    is_migration: false
  }
  const invoices = [
    {
      id: 'deposit', tenant_id: 'tenant-351', created_at: '2026-06-07T15:42:34.936+07:00',
      payment_status: 'paid', paid_amount: 2200000, billing_reason: 'deposit_collect',
      deposit_amount: 2200000, room_cost: 0
    },
    {
      id: 'june-monthly', tenant_id: 'tenant-351', created_at: '2026-06-07T15:43:42.905+07:00',
      payment_status: 'paid', paid_amount: 3453000, billing_reason: 'monthly',
      is_first_month: false, room_cost: 2400000, electric_cost: 500000, water_cost: 153000
    }
  ]
  assert.equal(getRoomListSummary(invoices, contract, 0).hasStartedBilling, true)
})

test('empty and migration rooms retain their existing decisions', () => {
  const migrated = { id: 'contract', room_id: 'room', created_at: '2026-01-01', is_migration: true }
  assert.deepEqual(getRoomListSummary([], undefined, 0), legacySummary([], undefined, 0))
  assert.deepEqual(getRoomListSummary([], migrated, 1), legacySummary([], migrated, 1))
})

test('invalid invoice dates preserve the legacy exclusion rule', () => {
  const contract = { id: 'contract', room_id: 'room', tenant_id: 'tenant', created_at: '2026-01-01' }
  const invoices = [
    { id: 'invalid', tenant_id: 'tenant', created_at: 'not-a-date', payment_status: 'unpaid', is_first_month: true, paid_amount: 0 },
    { id: 'valid', tenant_id: 'tenant', created_at: '2026-01-02', payment_status: 'paid', paid_amount: 100 }
  ]
  assert.deepEqual(getRoomListSummary(invoices, contract, 0), legacySummary(invoices, contract, 0))
})

const backupPath = process.env.PERF_BACKUP_ZIP
test('room summary agrees with legacy logic for every room in a local backup', { skip: !backupPath }, () => {
  const zip = new AdmZip(backupPath)
  const readTable = (name) => JSON.parse(zip.getEntry(`database/${name}.json`).getData().toString('utf8'))
  const rooms = readTable('rooms')
  const invoices = readTable('invoices')
  const contracts = readTable('contracts')
  const receipts = readTable('move_in_receipts')
  const invoicesByRoom = Map.groupBy(invoices, (invoice) => invoice.room_id)
  const receiptsByRoom = Map.groupBy(receipts, (receipt) => receipt.room_id)
  const activeContracts = new Map()
  for (const contract of contracts) {
    if (contract.status !== 'active') continue
    const current = activeContracts.get(contract.room_id)
    if (!current || new Date(contract.created_at).getTime() > new Date(current.created_at).getTime()) {
      activeContracts.set(contract.room_id, contract)
    }
  }
  for (const room of rooms) {
    const args = [invoicesByRoom.get(room.id) || [], activeContracts.get(room.id), receiptsByRoom.get(room.id)?.length || 0]
    assert.deepEqual(getRoomListSummary(...args), legacySummary(...args), `room ${room.id}`)
  }
  assert.ok(rooms.length > 0)
})
