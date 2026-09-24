import './assets/main.css'

import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
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

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Renderer] React render error:', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex h-screen items-center justify-center bg-[#005B3C] p-6 text-white">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
          <h1 className="text-lg font-bold">Không thể tải màn hình này</h1>
          <p className="mt-2 text-sm text-slate-600">
            Ứng dụng vẫn đang chạy. Hãy tải lại màn hình; nếu lỗi lặp lại, gửi log để kiểm tra.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-slate-100 p-3 text-xs text-rose-700">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
          >
            Tải lại ứng dụng
          </button>
        </div>
      </div>
    )
  }
}

window.addEventListener('error', (event) => {
  console.error('[Renderer] window error:', event.error || event.message)
})
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Renderer] unhandled rejection:', event.reason)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </QueryClientProvider>
  </StrictMode>
)

// Keep the icon CDN out of the critical rendering path; icons fill in after the shell mounts.
window.setTimeout(loadIconStylesheet, 0)
