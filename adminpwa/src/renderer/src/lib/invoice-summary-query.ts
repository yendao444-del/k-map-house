import type { QueryClient } from '@tanstack/react-query'
import { getInvoices, type Invoice, type InvoiceMonthSummary } from './db'

export function summarizeInvoiceMonths(invoices: Invoice[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const invoice of invoices) {
    if (!invoice.month || !invoice.year) continue
    const key = `${invoice.year}-${invoice.month}`
    counts[key] = (counts[key] || 0) + 1
  }
  return counts
}

export function summarizeInvoiceMonth(invoices: Invoice[], month: number, year: number): InvoiceMonthSummary {
  const summary: InvoiceMonthSummary = {
    total: 0, paid: 0, unpaid: 0, partial: 0, settlement: 0, merged: 0, cancelled: 0
  }
  for (const invoice of invoices) {
    if (invoice.month !== month || invoice.year !== year) continue
    summary.total++
    if (invoice.is_settlement) summary.settlement++
    if (invoice.payment_status === 'merged') summary.merged++
    if (invoice.payment_status === 'cancelled') summary.cancelled++
    if (invoice.is_settlement) continue
    if (invoice.payment_status === 'paid') summary.paid++
    if (invoice.payment_status === 'unpaid') summary.unpaid++
    if (invoice.payment_status === 'partial') summary.partial++
  }
  return summary
}

async function readCompleteInvoices(queryClient: QueryClient): Promise<Invoice[]> {
  // The root uses this exact unfiltered key and getInvoices walks every page.
  // Invalidated/stale data is refreshed, with concurrent consumers deduplicated.
  return queryClient.fetchQuery({ queryKey: ['invoices'], queryFn: getInvoices, staleTime: 60_000 })
}

export async function readInvoiceMonthCounts(queryClient: QueryClient): Promise<Record<string, number>> {
  return summarizeInvoiceMonths(await readCompleteInvoices(queryClient))
}

export async function readInvoiceMonthSummary(queryClient: QueryClient, month: number, year: number): Promise<InvoiceMonthSummary> {
  return summarizeInvoiceMonth(await readCompleteInvoices(queryClient), month, year)
}

export function seedInvoiceMonthPage(queryClient: QueryClient, month: number, year: number, limit: number):
  { pages: Invoice[][]; pageParams: number[] } | undefined {
  const state = queryClient.getQueryState<Invoice[]>(['invoices'])
  if (state?.status !== 'success' || state.isInvalidated || !state.data ||
      Date.now() - state.dataUpdatedAt >= 60_000) return undefined
  // Root history has the same created_at/id ordering as the paged query.
  // Seed only page zero; paging/export still fetch all remaining pages.
  return {
    pages: [state.data.filter((invoice) => invoice.month === month && invoice.year === year).slice(0, limit)],
    pageParams: [0]
  }
}
