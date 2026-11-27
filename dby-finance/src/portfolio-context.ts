import { createContext, useContext } from 'react'
import type { InvestmentPortfolio } from '@renderer/lib/investment-store'

// Lets deeply nested trade modals know whether money comes from the rental
// operating wallet ('property') or from outside (DBY Finance 'personal').
export const InvestmentPortfolioContext = createContext<InvestmentPortfolio>('property')
export const useInvestmentPortfolio = (): InvestmentPortfolio => useContext(InvestmentPortfolioContext)

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} đ`
export const personalShortfallMessage = (shortfall: number) =>
  `Ví đầu tư thiếu ${money(shortfall)}. Hãy nạp tiền vào Ví đầu tư trước khi mua.`
