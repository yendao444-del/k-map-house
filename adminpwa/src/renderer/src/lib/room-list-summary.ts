import type { Contract, Invoice } from './db'

type RoomListContract = Pick<
  Contract,
  'created_at' | 'move_in_date' | 'tenant_id' | 'is_migration'
>

export type RoomListSummary = {
  endingOutstandingInvoice: Invoice | null
  unpaidFirstMonthForCurrentTenant: Invoice | undefined
  canCancel: boolean
  canDeleteRoom: boolean
  hasStartedBilling: boolean
}

export function getRoomListSummary(
  invoices: Invoice[],
  activeContract: RoomListContract | undefined,
  moveInReceiptCount: number
): RoomListSummary {
  // Keep all room decisions in one pass. This avoids creating several arrays
  // and sorting the outstanding subset for every room with long histories.
  const fallbackNow = Date.now()
  const contractStartMs = new Date(
    activeContract?.created_at || activeContract?.move_in_date || fallbackNow
  ).getTime()
  let roomInvoiceCount = 0
  let endingOutstandingInvoice: Invoice | null = null
  let unpaidFirstMonthForCurrentTenant: Invoice | undefined
  let hasPaidOrPartiallyPaidInvoice = false
  let hasStartedInvoice = false
  let hasInvalidOutstandingDate = false
  const eligibleInvoices: Invoice[] = []

  for (const invoice of invoices) {
    const isCancelledOrMerged =
      invoice.payment_status === 'cancelled' || invoice.payment_status === 'merged'
    if (!isCancelledOrMerged) roomInvoiceCount++
    if (activeContract?.tenant_id && invoice.tenant_id !== activeContract.tenant_id) continue

    const invoiceDateMs = new Date(
      invoice.created_at || invoice.invoice_date || activeContract?.created_at || fallbackNow
    ).getTime()
    // Match the old `date >= contractStart` filter exactly, including invalid
    // dates (comparisons with NaN must be excluded rather than treated as ready).
    if (!(invoiceDateMs >= contractStartMs)) continue
    eligibleInvoices.push(invoice)

    if (!isCancelledOrMerged) {
      if (
        invoice.payment_status === 'paid' ||
        invoice.payment_status === 'partial' ||
        invoice.paid_amount > 0
      ) {
        hasPaidOrPartiallyPaidInvoice = true
      }
      if (invoice.payment_status === 'unpaid' || invoice.payment_status === 'partial') {
        const current = endingOutstandingInvoice
        const firstMonthOrder =
          Number(Boolean(invoice.is_first_month)) - Number(Boolean(current?.is_first_month))
        const invoiceCreatedMs = new Date(invoice.created_at).getTime()
        const currentDateMs = current
          ? new Date(current.created_at).getTime()
          : Number.NEGATIVE_INFINITY
        if (Number.isNaN(invoiceCreatedMs)) hasInvalidOutstandingDate = true
        if (
          !current ||
          firstMonthOrder > 0 ||
          (firstMonthOrder === 0 && invoiceCreatedMs > currentDateMs)
        ) {
          endingOutstandingInvoice = invoice
        }
      }
      if (!hasStartedInvoice) {
        if (!invoice.is_settlement && invoice.billing_reason !== 'contract_end' && invoice.is_first_month) {
          hasStartedInvoice = true
        } else if (
          !invoice.is_settlement &&
          invoice.billing_reason !== 'contract_end' &&
          (invoice.payment_status === 'paid' || Number(invoice.paid_amount || 0) > 0) &&
          (Number(invoice.room_cost || 0) > 0 ||
            Number(invoice.electric_cost || 0) > 0 ||
            Number(invoice.water_cost || 0) > 0 ||
            Number(invoice.wifi_cost || 0) > 0 ||
            Number(invoice.garbage_cost || 0) > 0)
        ) {
          hasStartedInvoice = true
        }
      }
    }
    if (
      !unpaidFirstMonthForCurrentTenant &&
      invoice.is_first_month &&
      invoice.payment_status === 'unpaid' &&
      !invoice.debt_confirmed_at &&
      (invoice.paid_amount || 0) === 0
    ) {
      unpaidFirstMonthForCurrentTenant = invoice
    }
  }

  // JavaScript's stable sort treats NaN comparators as zero. Preserve that
  // legacy edge-case exactly when malformed historical dates are present;
  // normal production rows stay on the faster one-pass path above.
  if (hasInvalidOutstandingDate) {
    endingOutstandingInvoice =
      eligibleInvoices
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
  }

  return {
    endingOutstandingInvoice,
    unpaidFirstMonthForCurrentTenant,
    canCancel: Boolean(activeContract && !hasPaidOrPartiallyPaidInvoice),
    canDeleteRoom: roomInvoiceCount === 0 && moveInReceiptCount === 0,
    hasStartedBilling: hasStartedInvoice || activeContract?.is_migration === true
  }
}
