// Isolated fixture only. No production database client or user data is loaded.
const summary = { bankBalance: 100000000, cashBalance: 0, totalBalance: 100000000, availableBalance: 100000000, entries: [] }
export const getCashTransactions = async () => []
export const getInvoices = async () => []
export const getAppSettings = async () => ({})
export const buildWalletBalanceSummary = () => summary
export const getWalletBalanceSummary = async () => summary
export const createCashTransaction = async () => { throw Error('QA: financial writes are disabled') }
export const deleteCashTransaction = async () => { throw Error('QA: financial writes are disabled') }
