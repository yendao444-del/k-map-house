import type { Contract, Invoice } from './db'

export type RoomListSummary = {
  endingOutstandingInvoice: Invoice | null
  unpaidFirstMonthForCurrentTenant: Invoice | undefined
  canCancel: boolean
  canDeleteRoom: boolean
  hasStartedBilling: boolean
}

export function getRoomListSummary(
  invoices: Invoice[],
  activeContract: Contract | undefined,
  moveInReceiptCount: number
): RoomListSummary {
  const roomInvoiceCount = invoices.filter(
    (invoice) => invoice.payment_status !== 'cancelled' && invoice.payment_status !== 'merged'
  ).length
  const checkInvoices = invoices.filter(
    (invoice) =>
      (!activeContract?.tenant_id || invoice.tenant_id === activeContract.tenant_id) &&
      new Date(
        invoice.created_at || invoice.invoice_date || activeContract?.created_at || Date.now()
      ).getTime() >=
        new Date(activeContract?.created_at || activeContract?.move_in_date || Date.now()).getTime()
  )
  const endingOutstandingInvoice =
    checkInvoices
      .filter(
        (invoice) =>
          invoice.payment_status !== 'cancelled' &&
          invoice.payment_status !== 'merged' &&
          (invoice.payment_status === 'unpaid' || invoice.payment_status === 'partial')
      )
      .sort((a, b) => {
        if (!!a.is_first_month !== !!b.is_first_month) return a.is_first_month ? -1 : 1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })[0] || null
  const unpaidFirstMonthForCurrentTenant = checkInvoices.find(
    (invoice) =>
      invoice.is_first_month &&
      invoice.payment_status === 'unpaid' &&
      !invoice.debt_confirmed_at &&
      (invoice.paid_amount || 0) === 0
  )
  const canCancel = Boolean(
    activeContract &&
      !checkInvoices.some(
        (invoice) =>
          invoice.payment_status !== 'cancelled' &&
          invoice.payment_status !== 'merged' &&
          (invoice.payment_status === 'paid' ||
            invoice.payment_status === 'partial' ||
            invoice.paid_amount > 0)
      )
  )
  const hasStartedInvoice = checkInvoices.some((invoice) => {
    if (invoice.payment_status === 'cancelled' || invoice.payment_status === 'merged') return false
    if (invoice.is_settlement || invoice.billing_reason === 'contract_end') return false
    if (invoice.is_first_month) return true
    if (invoice.payment_status !== 'paid' && Number(invoice.paid_amount || 0) <= 0) return false
    return (
      Number(invoice.room_cost || 0) > 0 ||
      Number(invoice.electric_cost || 0) > 0 ||
      Number(invoice.water_cost || 0) > 0 ||
      Number(invoice.wifi_cost || 0) > 0 ||
      Number(invoice.garbage_cost || 0) > 0
    )
  })

  return {
    endingOutstandingInvoice,
    unpaidFirstMonthForCurrentTenant,
    canCancel,
    canDeleteRoom: roomInvoiceCount === 0 && moveInReceiptCount === 0,
    hasStartedBilling: hasStartedInvoice || activeContract?.is_migration === true
  }
}
