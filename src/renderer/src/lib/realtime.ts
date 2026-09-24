import { QueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

export function setupRealtime(queryClient: QueryClient): () => void {
  const tableQueryKeys: Record<string, string[][]> = {
    rooms: [['rooms']],
    invoices: [['invoices'], ['roomInvoices']],
    contracts: [['contracts'], ['activeContracts']],
    tenants: [['tenants']],
    service_zones: [['serviceZones']],
    app_settings: [['appSettings'], ['app_settings']],
    move_in_receipts: [['moveInReceipts'], ['roomMoveInReceipts'], ['move_in_receipts']],
    asset_snapshots: [['asset_snapshots']],
    room_assets: [['room_assets'], ['allRoomAssets'], ['roomAssets']],
    room_asset_adjustments: [['room_asset_adjustments']],
    room_vehicles: [['vehicles'], ['room_vehicles']],
    cash_transactions: [['cashTransactions']],
    users: [['users']]
  }

  const pendingKeys = new Map<string, string[]>()
  let flushTimer: ReturnType<typeof setTimeout> | undefined

  const flushInvalidations = (): void => {
    flushTimer = undefined
    for (const queryKey of pendingKeys.values()) {
      void queryClient.invalidateQueries({ queryKey, refetchType: 'active' })
    }
    pendingKeys.clear()
  }

  const queueInvalidation = (table: string): void => {
    for (const queryKey of tableQueryKeys[table] || []) {
      pendingKeys.set(JSON.stringify(queryKey), queryKey)
    }
    if (!flushTimer && pendingKeys.size > 0) {
      flushTimer = setTimeout(flushInvalidations, 250)
    }
  }

  // Each effect setup gets its own topic. React StrictMode and auth refreshes
  // can overlap cleanup with the next setup; reusing a topic can mutate a
  // channel after it has already subscribed and crash the renderer.
  const channelName = `db-changes-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const channel: RealtimeChannel = supabase.channel(channelName)
  for (const table of Object.keys(tableQueryKeys)) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      () => queueInvalidation(table)
    )
  }
  void channel.subscribe()

  return () => {
    if (flushTimer) clearTimeout(flushTimer)
    pendingKeys.clear()
    void supabase.removeChannel(channel).catch(() => undefined)
  }
}
