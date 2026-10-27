export type PwaEvent = 'update' | 'offline' | 'online'
let registration: ServiceWorkerRegistration | undefined
let updateRequired = false
let activatedInAnotherTab = false
let applying: Promise<Awaited<ReturnType<Window['api']['update']['installLatest']>>> | undefined
const handlers = new Set<() => void>()
export const onPwaChange = (handler: () => void): (() => void) => { handlers.add(handler); return () => { handlers.delete(handler) } }
export const hasPwaUpdate = () => updateRequired
const changed = () => { for (const handler of handlers) handler() }
let versionData: { version: string; buildId: string; publishedAt: string; releaseNotes: string } | undefined

function detectUpdate(): void {
  // Keep the gate latched if another tab accepts the waiting worker.
  if (registration?.waiting && navigator.serviceWorker.controller) updateRequired = true
  changed()
}

async function refreshWorker(): Promise<void> {
  if (!navigator.onLine || !registration) return
  try { await registration.update(); detectUpdate() } catch { /* Retry on foreground/online or the next scheduled check. */ }
}

async function check() {
  try {
    const response = await fetch('/version.json', { cache: 'no-store' })
    if (!response.ok) throw new Error('Không tải được thông tin bản PWA.')
    versionData = await response.json()
    await registration?.update()
    detectUpdate()
    const data: NonNullable<Awaited<ReturnType<Window['api']['update']['check']>>['data']> = {
      currentVersion: import.meta.env.VITE_APP_VERSION, latestVersion: versionData!.version, hasUpdate: hasPwaUpdate(),
      releaseNotes: versionData!.releaseNotes, publishedAt: versionData!.publishedAt,
      downloadUrl: null, downloadSize: 0, artifactType: 'none', fileName: null
    }
    return { success: true, data }
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Không kiểm tra được bản cập nhật PWA.' } }
}
function installLatest(): Promise<Awaited<ReturnType<Window['api']['update']['installLatest']>>> {
  if (applying) return applying
  const worker = registration?.waiting
  const success = () => ({ success: true, data: { version: import.meta.env.VITE_APP_VERSION, latestVersion: versionData?.version || import.meta.env.VITE_APP_VERSION, applied: true } })
  if (!worker) {
    if (activatedInAnotherTab) {
      window.location.reload()
      return Promise.resolve(success())
    }
    return Promise.resolve({ success: false, error: 'Chưa có bản PWA mới sẵn sàng. Hãy kiểm tra cập nhật rồi thử lại.' })
  }
  applying = new Promise(resolve => {
    let settled = false
    let timer: number
    const finish = (applied: boolean, error?: string) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      navigator.serviceWorker.removeEventListener('controllerchange', activated)
      worker.removeEventListener('statechange', stateChanged)
      if (applied) {
        resolve(success())
        window.location.reload()
      } else resolve({ success: false, error: error || 'Cập nhật chưa hoàn tất. Vui lòng bấm thử lại.' })
    }
    const activated = () => {
      if (navigator.serviceWorker.controller === worker && worker.state === 'activated') finish(true)
    }
    const stateChanged = () => {
      if (worker.state === 'redundant') finish(false, 'Bản cập nhật đã được thay thế. Vui lòng thử lại.')
      else if (worker.state === 'activated') activated()
    }
    timer = window.setTimeout(() => finish(false), 15000)
    navigator.serviceWorker.addEventListener('controllerchange', activated)
    worker.addEventListener('statechange', stateChanged)
    try { worker.postMessage({ type: 'ACCEPT_UPDATE' }) }
    catch { finish(false, 'Không thể áp dụng bản cập nhật. Vui lòng thử lại.') }
  })
  const pending = applying
  void pending.finally(() => { if (applying === pending) applying = undefined })
  return pending
}

export function installPwaRuntime(): void {
  window.api.update.check = check
  window.api.update.installLatest = installLatest
  window.api.update.getHistory = async () => {
    const result = await check()
    if (!result.success || !versionData) return { success: false, error: result.error }
    return { success: true, data: [{ tag_name: `pwa-${versionData.version}`, body: versionData.releaseNotes, published_at: versionData.publishedAt, assets: [] }] }
  }
  window.addEventListener('online', () => { changed(); void refreshWorker() })
  window.addEventListener('offline', changed)
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    let previousController = navigator.serviceWorker.controller
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (previousController && navigator.serviceWorker.controller !== previousController) {
        activatedInAnotherTab = true
        updateRequired = true
        changed()
      }
      previousController = navigator.serviceWorker.controller
    })
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(result => {
      registration = result
      const observeInstalling = () => { result.installing?.addEventListener('statechange', detectUpdate) }
      observeInstalling()
      result.addEventListener('updatefound', observeInstalling)
      detectUpdate()
      void refreshWorker()
      window.setInterval(() => { void refreshWorker() }, 5 * 60 * 1000)
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refreshWorker() })
    }).catch(() => { console.warn('Không đăng ký được chế độ PWA; ứng dụng vẫn chạy trực tuyến.') })
  }
}
