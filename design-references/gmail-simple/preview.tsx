import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EmailNotificationPanel } from '../../src/renderer/src/components/EmailNotificationPanel'
import '../../src/renderer/src/assets/main.css'
window.api = { gmail: { getAvailability: async () => ({ available: true, authenticated: true }) } }
const user = {
  id: 'preview-user', username: 'preview', full_name: 'Đào Bình Yên', status: 'active', role: 'admin',
  created_at: '2026-10-05', notification_email: 'demo@example.com', email_notifications_enabled: true,
  email_notification_preferences: { sepay_matched: true, sepay_unmatched: true,
    room_checkout_due: false, rent_overdue: false, rent_long_unpaid: false,
    invoices_services: false, contract_expiring: false }
}
createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={new QueryClient()}>
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-label="Gmail · Xem trước" className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[24px] bg-white shadow-2xl">
        <EmailNotificationPanel user={user} onClose={() => { document.getElementById('fixture-status').textContent = 'Đã bấm đóng trong bản xem trước.' }} />
      </div>
    </div>
    <div id="fixture-status" style={{ position: 'fixed', bottom: 0, left: 0, background: 'white', fontSize: 11 }}>Xem trước · dữ liệu giả · không gửi thư thật</div>
  </QueryClientProvider>
)
