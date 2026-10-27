import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InvestmentsTab } from '../../../../src/renderer/src/components/InvestmentsTab'
import '../../../../src/renderer/src/assets/main.css'
import logo from '../../../../src/renderer/src/assets/an_khang_home_logo.png'
import './shell.css'

const populated = new URLSearchParams(location.search).get('state') === 'populated'
const holdings = populated ? [
  { symbol: 'MH9999', name: 'Vàng MH 9999 · Mỹ Hạnh', category: 'gold', group: 'Vàng', quantity: '2 chỉ', valueVnd: 27100000, pnlPercent: 0, allocationPercent: 75, targetPercent: 70 },
  { symbol: 'VNHAN', name: 'Vàng nhẫn cũ', category: 'gold', group: 'Vàng', quantity: '1 chỉ', valueVnd: 9000000, pnlPercent: 0, allocationPercent: 25, targetPercent: 30 }
] : []
const transactions = populated ? [
  { id: 'QA-MH-001', date: '2026-10-20', transactionType: 'buy', assetSymbol: 'MH9999', amountVnd: 27100000, status: 'done', note: '', quantity: 2, unit: 'chỉ', unitPriceVnd: 13550000, fundingSource: 'investment-wallet', walletPosting: { amount: -27100000, paymentMethod: 'transfer' } },
  { id: 'QA-CLOSED-002', date: '2026-10-19', transactionType: 'sell', assetSymbol: 'VMIENG', amountVnd: 10000000, status: 'done', note: '', quantity: 1, unit: 'chỉ', unitPriceVnd: 10000000, fundingSource: 'investment-wallet', walletPosting: { amount: 10000000, paymentMethod: 'transfer' } }
] : []
window.api = { investment: {
  read: async () => ({ data: { holdings, transactions, portfolioSnapshots: [], categoryTargets: {} } }),
  write: async () => { throw Error('QA: writes are disabled') }
} } as unknown as typeof window.api

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const root = import.meta.hot?.data.root || createRoot(document.getElementById('root')!)
if (import.meta.hot) import.meta.hot.dispose(data => { data.root = root })
root.render(<QueryClientProvider client={queryClient}>
  <header className="qa-shell"><img src={logo} alt="An Khang Home" /><strong>AN KHANG HOME</strong><span>Kiểm tra giao diện Vàng · Dữ liệu mẫu · Không ghi giao dịch</span></header>
  <div className="qa-app"><InvestmentsTab userRole="admin" /></div>
</QueryClientProvider>)
