import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installGlobalSoundEffects, playError } from './lib/sound'

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'

installGlobalSoundEffects()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
      // Chỉ re-render khi data/status/error thay đổi, KHÔNG re-render khi isFetching thay đổi
      // Tránh UI nhấp nháy mỗi lần query bắt đầu/kết thúc refetch
      notifyOnChangeProps: ['data', 'status', 'error'],
    }
  },
  mutationCache: new MutationCache({
    onError: () => {
      playError()
    },
  }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
