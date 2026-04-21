import { QueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

export function setupRealtime(queryClient: QueryClient) {
    const channel = supabase
        .channel('db-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public' },
            () => {
                // Invalidate all queries on any change to keep it simple and robust
                queryClient.invalidateQueries()
            }
        )
        .subscribe()

    return () => {
        // Correct way to unsubscribe without returning a promise to useEffect
        supabase.removeChannel(channel)
    }
}
