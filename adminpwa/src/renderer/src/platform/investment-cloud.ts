import type { InvestmentStore } from '../lib/investment-store'
import { commitCloudInvestment, parseInvestmentSnapshot } from '../lib/investment-cloud-policy'
import { supabase } from '../lib/supabase'

export async function readCloudInvestmentStore() {
  const { data, error } = await supabase.rpc('admin_pwa_investment_read')
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  const snapshot = parseInvestmentSnapshot(data)
  return { data: snapshot.data }
}

export async function writeCloudInvestmentStore(value: unknown): Promise<boolean> {
  const store = value as InvestmentStore
  const result = await commitCloudInvestment({ store, requestId: crypto.randomUUID(), send: async payload => {
    const { data, error } = await supabase.rpc('admin_pwa_investment_commit', payload)
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    return data
  } })
  store.pwaVersion = result.version
  return true
}

export async function importCloudInvestmentStore(store: InvestmentStore) {
  return commitCloudInvestment({ store, requestId: crypto.randomUUID(), send: async payload => {
    const { data, error } = await supabase.rpc('admin_pwa_investment_import', payload)
    if (error) throw Object.assign(new Error(error.message), { code: error.code })
    return data
  } })
}
