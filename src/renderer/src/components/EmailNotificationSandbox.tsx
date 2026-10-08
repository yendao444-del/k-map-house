import { useMemo, useState } from 'react'
import { emailNotificationOptions } from '../lib/email-notification-preferences'
import {
  createNotificationTestCase,
  notificationTestScenarios,
  simulateNotification,
  type NotificationSimulation
} from '../lib/email-notification-testing'
import type { NotificationType } from '../lib/notification-email'
import { notificationEmailPreviewHtml } from '../../../shared/notification-email-assets'

// This component has no query, database, Gmail IPC or delivery imports.
const sampleUser = {
  id: 'TEST-user',
  username: 'TEST-user',
  full_name: 'Tài khoản mẫu',
  status: 'active' as const,
  role: 'user' as const,
  created_at: '2026-10-05',
  notification_email: 'demo@example.com',
  email_notifications_enabled: true,
  email_notification_preferences: {
    room_checkout_due: true,
    rent_overdue: true,
    rent_long_unpaid: true,
    sepay_unmatched: true,
    sepay_matched: true,
    invoices_services: true,
    contract_expiring: true
  }
}
const sampleGmail = { available: true, authenticated: true }

export function EmailNotificationSandbox({
  onBack,
  onClose
}: {
  onBack: () => void
  onClose: () => void
}): React.JSX.Element {
  const [type, setType] = useState<NotificationType>('room_checkout_due')
  const [scenario, setScenario] = useState('due')
  const [result, setResult] = useState<NotificationSimulation | null>(null)
  const [runCount, setRunCount] = useState(0)
  const [previewOpen, setPreviewOpen] = useState(false)
  const testCase = useMemo(
    () => createNotificationTestCase(type, scenario, sampleUser.full_name),
    [type, scenario]
  )
  return (
    <section className="bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-black text-[#10233f]">Gmail · Kiểm thử</h4>
          <p className="mt-1 text-xs text-slate-500">Tài khoản mẫu · dữ liệu giả</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-500 hover:bg-slate-100"
        >
          ×
        </button>
      </div>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
        <p className="text-sm font-black text-[#10233f]">Chọn nội dung kiểm thử</p>
        <p className="mt-1 text-xs text-slate-500">
          Không đọc dữ liệu thật, không gửi Gmail và không thay đổi công nợ.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-700">
            Loại thông báo
            <select
              value={type}
              onChange={(event) => {
                const next = event.target.value as NotificationType
                setType(next)
                setScenario(notificationTestScenarios[next][0].id)
                setResult(null)
              }}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal"
            >
              {emailNotificationOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            Tình huống
            <select
              value={scenario}
              onChange={(event) => {
                setScenario(event.target.value)
                setResult(null)
              }}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-normal"
            >
              {notificationTestScenarios[type].map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setResult(simulateNotification(testCase, sampleUser, sampleGmail))
            setRunCount((current) => current + 1)
            setPreviewOpen(true)
          }}
          className="rounded-xl bg-[#06603f] px-4 py-2.5 text-sm font-bold text-white"
        >
          Chạy kiểm thử
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-[#06603f] px-4 py-2.5 text-sm font-bold text-[#06603f]"
        >
          Quay lại
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Gmail và tài khoản đều được mô phỏng. Không cần kết nối Gmail.
      </p>
      {result && (
        <div role="status" className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <p className="text-xs font-bold text-slate-700">Đã chạy kiểm thử · lần {runCount}</p>
          <p className="mt-1 text-xs font-semibold text-slate-700">{result.summary}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-bold text-slate-600">
              Chi tiết kiểm thử
            </summary>
            <ul className="mt-2 space-y-2">
              {result.checks.map((check) => (
                <li key={check.name} className="text-xs text-slate-600">
                  <strong
                    className={
                      check.status === 'pass'
                        ? 'text-emerald-700'
                        : check.status === 'blocked' || check.status === 'unavailable'
                          ? 'text-amber-700'
                          : 'text-slate-700'
                    }
                  >
                    {check.name}:{' '}
                    {check.status === 'pass'
                      ? 'Đạt'
                      : check.status === 'blocked'
                        ? 'Bỏ qua / Chờ'
                        : check.status === 'unavailable'
                          ? 'Chưa có'
                          : 'Thông tin'}
                  </strong>
                  <p>{check.detail}</p>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      <details
        open={previewOpen}
        onToggle={(event) => setPreviewOpen(event.currentTarget.open)}
        className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
      >
        <summary className="cursor-pointer text-xs font-bold text-slate-700">
          Xem trước email mẫu
        </summary>
        <p className="mt-2 break-words text-xs font-semibold text-slate-700">
          {testCase.mail.subject}
        </p>
        <iframe
          title="Nội dung email kiểm thử"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={`<!doctype html><html lang="vi"><meta charset="utf-8"><style>body{font:13px Arial,sans-serif;color:#334155;line-height:1.5;overflow-wrap:anywhere}</style><body>${notificationEmailPreviewHtml(testCase.mail.html)}</body></html>`}
          className="mt-2 h-[min(65vh,640px)] w-full rounded-lg border border-slate-100 bg-white"
        />
      </details>
    </section>
  )
}
