import type { Invoice } from './db'

// Shared presentation/business classification from the Electron source.
// Kept pure so the mobile list can use exactly the same rule without starting
// an Auth/client connection during unit tests.
export const isDepositOnlyInvoice = (invoice: Pick<Invoice,
  'billing_reason' | 'deposit_amount' | 'is_first_month' | 'is_settlement' |
  'room_cost' | 'wifi_cost' | 'garbage_cost' | 'old_debt' | 'electric_cost' |
  'water_cost' | 'total_amount' | 'transfer_room_cost' | 'transfer_electric_cost' |
  'transfer_water_cost' | 'transfer_service_cost' | 'new_room_cost' | 'new_room_service_cost'
>): boolean => {
  const reason = (invoice.billing_reason || '').trim()
  if (reason === 'deposit_collect' || reason === 'deposit_refund') return true
  const deposit = Number(invoice.deposit_amount || 0)
  if (deposit === 0 || invoice.is_first_month || invoice.is_settlement) return false
  const nonDeposit = Number(invoice.room_cost || 0) + Number(invoice.wifi_cost || 0) +
    Number(invoice.garbage_cost || 0) + Number(invoice.old_debt || 0) +
    Number(invoice.electric_cost || 0) + Number(invoice.water_cost || 0) +
    Number(invoice.transfer_room_cost || 0) + Number(invoice.transfer_electric_cost || 0) +
    Number(invoice.transfer_water_cost || 0) + Number(invoice.transfer_service_cost || 0) +
    Number(invoice.new_room_cost || 0) + Number(invoice.new_room_service_cost || 0)
  return nonDeposit === 0 && Math.abs(Number(invoice.total_amount || 0)) === Math.abs(deposit)
}
