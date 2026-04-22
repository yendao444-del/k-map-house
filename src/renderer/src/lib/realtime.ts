import { QueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

export function setupRealtime(queryClient: QueryClient) {
    const invalidateByTable = (table?: string) => {
        if (!table) return
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

        const keys = tableQueryKeys[table] || []
        for (const queryKey of keys) {
            queryClient.invalidateQueries({ queryKey })
        }
    }

    const channel = supabase
        .channel('db-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public' },
            (payload) => {
                invalidateByTable((payload as any)?.table)
            }
        )
        .subscribe()

    return () => {
        // Correct way to unsubscribe without returning a promise to useEffect
        supabase.removeChannel(channel)
    }
}
