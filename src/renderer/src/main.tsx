import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installGlobalSoundEffects, playError } from './lib/sound'

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'

installGlobalSoundEffects()

function loadIconStylesheet(): void {
  if (document.querySelector('link[data-font-awesome]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
  link.dataset.fontAwesome = 'true'
  document.head.appendChild(link)
}

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

// Keep the icon CDN out of the critical rendering path; icons fill in after the shell mounts.
window.setTimeout(loadIconStylesheet, 0)
