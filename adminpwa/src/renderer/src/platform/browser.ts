import { supabase } from '../lib/supabase'
import { invoiceImage, downloadFile, saveInvoiceImage } from './export-image'
import { readCloudInvestmentStore, writeCloudInvestmentStore } from './investment-cloud'
type MarketSnapshot = Awaited<ReturnType<Window['api']['marketData']['getSnapshot']>>

const reason = (error: unknown) => error instanceof Error ? error.message : 'Không thể kết nối dịch vụ web.'
async function bridge<T>(action: string, payload: unknown = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-pwa-bridge', { body: { action, payload } })
  if (error) throw new Error(`Dịch vụ PWA chưa phản hồi: ${error.message}`)
  if (!data?.ok) throw new Error(data?.error || 'Dịch vụ từ chối thao tác.')
  return data.data as T
}

window.api = {
  contractTest: { open: async () => ({ ok: false, error: 'Môi trường test phải mở bằng URL preview riêng; không mở Electron từ PWA.' }) },
  tenantIdentity: {
    read: async dataUrl => (await import('./tenant-identity')).readIdentity(dataUrl),
    clipboard: async () => (await import('./tenant-identity')).readClipboardImage()
  },
  windowTheme: { setInvestmentTitleBar: async () => { /* Native titlebar has no browser equivalent; theme is CSS. */ } },
  db: {
    read: () => bridge('read-backup'),
    write: data => bridge<boolean>('restore-backup', { data }),
    getPath: async () => 'Dữ liệu backend dùng chung Electron'
  },
  investment: {
    read: readCloudInvestmentStore,
    write: writeCloudInvestmentStore,
    fundNav: async symbol => {
      const { data, error } = await supabase.functions.invoke('admin-pwa-market', { body: { action: 'fund-nav', symbol } })
      if (error) throw new Error('Chưa tải được NAV trực tuyến. Nhập NAV công bố thực tế.')
      if (!data?.ok) throw new Error(data?.error || 'Nguồn NAV chưa phản hồi.')
      return data.data
    }
  },
  marketData: {
    getSnapshot: propertyAddress => bridge('market-snapshot', { propertyAddress }),
    scanMarket: async payload => { try { return { ok: true, snapshot: await bridge<MarketSnapshot>('market-scan', payload) } } catch (error) { return { ok: false, error: reason(error) } } },
    scanPhongTro123: async payload => { try { return { ok: true, snapshot: await bridge<MarketSnapshot>('market-scan-phongtro123', payload) } } catch (error) { return { ok: false, error: reason(error) } } }
  },
  gmail: {
    getAvailability: async () => {
      try { return await bridge('email-availability') }
      catch (error) { return { available: false, authenticated: false, reason: reason(error) } }
    },
    reauthenticate: async () => ({ ok: false, error: 'PWA dùng dịch vụ email phía máy chủ. Không kết nối Gmail qua localhost của Electron.' }),
    sendNotification: async payload => {
      try { return await bridge('email-send', payload) }
      catch (error) { return { ok: false, notSent: true, error: reason(error) } }
    }
  },
  invoice: { saveImage: saveInvoiceImage, saveImageToDownloads: saveInvoiceImage },
  zalo: {
    send: async payload => {
      try {
        const file = await invoiceImage(payload)
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Hóa đơn AN KHANG HOME', text: payload.message || 'Hóa đơn phòng trọ' })
        } else {
          downloadFile(file, file.name)
          window.open(`https://zalo.me/${payload.phone.replace(/\D/g, '')}`, '_blank', 'noopener,noreferrer')
          window.alert('Đã tạo ảnh hóa đơn. Mở Zalo và chọn ảnh vừa tải để gửi cho khách thuê; ứng dụng không tự gửi tin nhắn.')
        }
        // This acknowledges preparation/sharing only, never proof of delivery.
        return { ok: true, phone: payload.phone }
      } catch (error) { return { ok: false, error: reason(error) } }
    }
  },
  tts: { synthesizePayment: async () => ({ ok: false, error: 'PWA đọc thông báo bằng giọng nói của thiết bị.' }) },
  perf: { benchmarkMode: false, markStartup: name => { performance.mark(name) }, getMetrics: async () => ({ capturedAt: new Date().toISOString(), processes: [] }) },
  // PWA update bridge is installed separately by pwa.ts. Never invoke the
  // Windows installer/updater from a browser.
  update: {
    check: async () => ({ success: false, error: 'Đang khởi tạo bộ cập nhật PWA.' }),
    getHistory: async () => ({ success: false, error: 'Lịch sử build PWA chưa được cấu hình.' }),
    installLatest: async () => ({ success: false, error: 'Đang khởi tạo bộ cập nhật PWA.' }),
    getCurrentVersion: async () => ({ success: true, data: import.meta.env.VITE_APP_VERSION }),
    getResult: async () => null,
    onAvailable: () => () => {}, onStatus: () => () => {}, onProgress: () => () => {}
  }
}
