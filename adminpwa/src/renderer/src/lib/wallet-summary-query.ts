import type { QueryClient } from '@tanstack/react-query'
import {
  buildWalletBalanceSummary,
  getCashTransactions,
  getInvoices,
  getAppSettings,
  type WalletBalanceSummary
} from './db'

// For display only. The commit path deliberately continues to call the live
// getWalletBalanceSummary function before accepting any operating-wallet transfer.
export async function readCachedWalletBalanceSummary(
  queryClient: QueryClient,
  forceRefresh = false
): Promise<WalletBalanceSummary> {
  const staleTime = forceRefresh ? 0 : 15_000
  const [transactions, invoices, settings] = await Promise.all([
    queryClient.fetchQuery({ queryKey: ['cashTransactions'], queryFn: getCashTransactions, staleTime }),
    queryClient.fetchQuery({ queryKey: ['invoices'], queryFn: getInvoices, staleTime }),
    queryClient.fetchQuery({ queryKey: ['appSettings'], queryFn: getAppSettings, staleTime })
  ])
  return buildWalletBalanceSummary(transactions, invoices, settings)
}
