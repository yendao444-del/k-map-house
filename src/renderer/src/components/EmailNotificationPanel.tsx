import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getEmailNotificationDeliveries,
  getEmailDeliveryAvailability,
  getInvoices,
  getRooms,
  sendEmailNotification,
  updateUserProfile,
  type AppUser
} from '../lib/db'
import {
  emailNotificationOptions,
  normalizeEmailNotificationPreferences,
  type EmailNotificationPreferences
} from '../lib/email-notification-preferences'
import {
  buildManualReminderEmail,
  getManualEmailTargets,
  manualEmailKey
} from '../lib/notification-email'
import { EmailNotificationSandbox } from './EmailNotificationSandbox'

export function EmailNotificationPanel({
  user,
  onClose
}: {
  user: AppUser
  onClose: () => void
}): React.JSX.Element {
  const client = useQueryClient()
  const [targetId, setTargetId] = useState('')
  const [notice, setNotice] = useState('')
  const [allowResend, setAllowResend] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [notificationEmail, setNotificationEmail] = useState(
    user.notification_email || user.email || ''
  )
  const [enabled, setEnabled] = useState(user.email_notifications_enabled === true)
  const [preferences, setPreferences] = useState<EmailNotificationPreferences>(
    normalizeEmailNotificationPreferences(user.email_notification_preferences)
  )
  const [savedSettings, setSavedSettings] = useState({
    email: user.notification_email || '',
    enabled: user.email_notifications_enabled === true,
    preferences: normalizeEmailNotificationPreferences(user.email_notification_preferences)
  })
  const [testMode, setTestMode] = useState(false)
  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms'],
    queryFn: getRooms,
    enabled: !testMode
  })
  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => getInvoices(),
    enabled: !testMode
  })
  const { data: history = [], error } = useQuery({
    queryKey: ['email-deliveries', user.id],
    queryFn: () => getEmailNotificationDeliveries(user.id),
    enabled: !testMode
  })
  const { data: gmailAvailability = { available: false, authenticated: false } } = useQuery({
    queryKey: ['gmail-availability'],
    queryFn: getEmailDeliveryAvailability,
    refetchOnMount: 'always',
    enabled: !testMode
  })
  const recipientChanged =
    notificationEmail.trim() !== savedSettings.email ||
    enabled !== savedSettings.enabled ||
    emailNotificationOptions.some(({ key }) => preferences[key] !== savedSettings.preferences[key])
  const targets = useMemo(
    () => (testMode ? [] : getManualEmailTargets(rooms, invoices)),
    [testMode, rooms, invoices]
  )
  const target = targets.find((item) => item.id === targetId)
  const dedupeKey = target ? manualEmailKey(target, user.id) : ''
  const previous = testMode ? undefined : history.find((item) => item.dedupe_key === dedupeKey)
  const send = useMutation({
    mutationFn: async () => {
      if (testMode) throw new Error('Chế độ kiểm thử không gửi Gmail thật.')
      if (!target) throw new Error('Vui lòng chọn một phòng cần gửi.')
      const { subject, html, detail } = buildManualReminderEmail(target, user.full_name)
      const result = await sendEmailNotification({
        recipientUserId: user.id,
        eventType: target.type,
        subject,
        html,
        dedupeKey,
        payload: { roomId: target.id.split(':')[0], targetDate: target.date, detail },
        resend: allowResend
      })
      if (!result.ok) throw new Error(result.error || 'Không gửi được email.')
      return result
    },
    onSuccess: (result) => {
      setNotice(
        result.status === 'skipped'
          ? 'Cảnh báo này đã được gửi, hệ thống bỏ qua để tránh gửi trùng.'
          : 'Đã gửi email thành công.'
      )
      setAllowResend(false)
      client.invalidateQueries({ queryKey: ['email-deliveries', user.id] })
    },
    onError: (cause) => {
      setNotice(cause instanceof Error ? cause.message : 'Gửi email thất bại.')
      void client.invalidateQueries({ queryKey: ['email-deliveries', user.id] })
    }
  })
  const connect = useMutation({
    mutationFn: async () => {
      if (testMode) throw new Error('Chế độ kiểm thử không kết nối Gmail thật.')
      const result = await window.api.gmail.reauthenticate()
      if (!result.ok) throw new Error(result.error || 'Không kết nối được Gmail.')
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['gmail-availability'] })
      setNotice('Đã kết nối Gmail trên máy dev.')
    },
    onError: (cause) =>
      setNotice(cause instanceof Error ? cause.message : 'Không kết nối được Gmail.')
  })
  const save = useMutation({
    mutationFn: async () => {
      if (testMode) throw new Error('Chế độ kiểm thử không lưu cài đặt thật.')
      const settings = { email: notificationEmail.trim(), enabled, preferences }
      await updateUserProfile(user.id, {
        full_name: user.full_name,
        phone: user.phone || '',
        notification_email: settings.email,
        email_notifications_enabled: settings.enabled,
        email_notification_preferences: settings.preferences
      })
      return settings
    },
    onSuccess: (settings) => {
      setSavedSettings(settings)
      setNotice('Đã lưu cài đặt nhận Gmail.')
      client.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (cause) =>
      setNotice(cause instanceof Error ? cause.message : 'Không lưu được cài đặt.')
  })
  if (testMode)
    return (
      <EmailNotificationSandbox
        onBack={() => {
          setTestMode(false)
          setNotice('')
        }}
        onClose={onClose}
      />
    )
  return (
    <section className="bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-black text-[#10233f]">Gmail · Cài đặt và gửi cảnh báo</h4>
          <p className="mt-1 text-xs text-slate-500">Tài khoản: {user.full_name}</p>
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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-black text-[#10233f]">Chọn phòng cần nhắc</p>
            <p className="mt-1 text-xs text-slate-500">Chỉ hiển thị phòng có lý do cảnh báo.</p>
          </div>
          <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-500">
            {targets.length} phòng
          </span>
        </div>
        {targets.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-500">
            Hiện chưa có phòng nào cần nhắc.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {targets.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTargetId(item.id)
                  setNotice('')
                  setAllowResend(false)
                }}
                className={`rounded-xl border p-3 text-left transition ${targetId === item.id ? 'border-[#06603f] bg-[#eaf8f3] ring-2 ring-[#06603f]/10' : 'border-slate-200 bg-white hover:border-[#00ab60]/40'}`}
              >
                <div className="flex items-center justify-between">
                  <strong className="text-sm text-[#10233f]">{item.roomName}</strong>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${item.type === 'rent_overdue' ? 'bg-rose-500' : 'bg-orange-500'}`}
                  />
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-600">{item.reason}</p>
                <p className="mt-1 text-[11px] text-slate-400">{item.label}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {target && (
        <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-slate-700">
          <strong>{target.roomName}</strong> · {target.reason} · mốc {target.date}
        </p>
      )}
      {previous && (
        <>
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Đã có lượt gửi cho cảnh báo này ({previous.status}).
          </p>
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={allowResend}
              onChange={(e) => setAllowResend(e.target.checked)}
            />{' '}
            Gửi lại có chủ đích
          </label>
        </>
      )}
      {gmailAvailability.available && !gmailAvailability.server && !gmailAvailability.authenticated && (
        <button
          type="button"
          onClick={() => connect.mutate()}
          disabled={connect.isPending}
          className="mt-3 rounded-xl border border-[#06603f] px-4 py-2.5 text-sm font-bold text-[#06603f] disabled:opacity-50"
        >
          {connect.isPending ? 'Đang kết nối...' : 'Kết nối Gmail máy dev'}
        </button>
      )}
      {gmailAvailability.available && !gmailAvailability.server && !gmailAvailability.authenticated && (
        <p className="mt-2 text-xs text-amber-700">
          Chưa kết nối Gmail: thông báo SePay chưa thể gửi. Hãy kết nối Gmail và mở máy dev để nhận
          thông báo tự động.
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-xs font-semibold text-slate-700">
          {notice}
        </p>
      )}
      {gmailAvailability.available && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => send.mutate()}
              disabled={
                !gmailAvailability.server && !gmailAvailability.authenticated ||
                !savedSettings.email ||
                !savedSettings.enabled ||
                user.status !== 'active' ||
                recipientChanged ||
                save.isPending ||
                send.isPending ||
                !target ||
                (Boolean(previous) && !allowResend)
              }
              className="rounded-xl bg-[#06603f] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {send.isPending ? 'Đang gửi...' : gmailAvailability.server ? 'Gửi email' : 'Gửi Gmail'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTestMode((value) => !value)
                setNotice('')
              }}
              disabled={save.isPending || send.isPending}
              className="rounded-xl border border-[#06603f] px-4 py-2.5 text-sm font-bold text-[#06603f] disabled:opacity-50"
            >
              Kiểm thử
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {gmailAvailability.server ? 'Đã bật gửi máy chủ; ứng dụng Electron không cần mở để gửi tự động.' : 'Kiểm thử dùng dữ liệu mẫu, không đọc hoặc thay đổi dữ liệu thật.'}
          </p>
        </>
      )}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={() => setSettingsOpen((value) => !value)}
          className="flex w-full justify-between text-left text-sm font-black text-[#10233f]"
        >
          Cài đặt nhận Gmail{' '}
          <span className="text-slate-400">{settingsOpen ? 'Thu gọn' : 'Mở cài đặt'}</span>
        </button>
        {settingsOpen && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <label className="block text-xs font-semibold text-slate-700">
              Gmail nhận thông báo
              <input
                type="email"
                required
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                placeholder="example@gmail.com"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-[#00ab60] focus:ring-2 focus:ring-[#00ab60]/10"
              />
            </label>
            <label className="mt-3 flex items-center justify-between gap-3 text-xs font-semibold text-slate-700">
              Bật nhận thông báo qua Gmail
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
            </label>
            <div className="mt-2 space-y-1">
              {emailNotificationOptions.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center justify-between rounded-lg px-2 py-2 text-xs text-slate-700 hover:bg-white"
                >
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    disabled={!enabled}
                    checked={preferences[key]}
                    onChange={(e) =>
                      setPreferences((current) => ({ ...current, [key]: e.target.checked }))
                    }
                    className="h-4 w-4 accent-emerald-600 disabled:opacity-40"
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="mt-3 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white"
            >
              {save.isPending ? 'Đang lưu...' : 'Lưu cài đặt Gmail'}
            </button>
          </div>
        )}
      </div>
      <div className="mt-5 border-t border-slate-100 pt-4">
        <h5 className="text-sm font-black text-[#10233f]">Lịch sử gửi gần đây</h5>
        {error && (
          <p className="mt-2 text-xs text-rose-600">
            Lịch sử gửi chưa được thiết lập trên máy chủ.
          </p>
        )}
        {history.length === 0 && !error && (
          <p className="mt-2 text-xs text-slate-500">Chưa có lượt gửi nào.</p>
        )}
        <div className="mt-2 max-h-52 space-y-2 overflow-y-auto">
          {history.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-100 px-3 py-2 text-xs">
              <div className="flex justify-between gap-2">
                <strong className="text-slate-700">{item.subject}</strong>
                <span className={item.status === 'sent' ? 'text-emerald-700' : 'text-rose-600'}>
                  {item.status === 'sent' ? 'Đã gửi' : item.status}
                </span>
              </div>
              <p className="mt-1 text-slate-500">
                {new Date(item.created_at).toLocaleString('vi-VN')}
              </p>
              {item.error_message && <p className="mt-1 text-rose-600">{item.error_message}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
