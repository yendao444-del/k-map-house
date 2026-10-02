import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getEmailNotificationDeliveries, getInvoices, getRooms, sendEmailNotification, updateUserProfile, type AppUser } from '../lib/db'
import { emailNotificationOptions, normalizeEmailNotificationPreferences, type EmailNotificationPreferences } from '../lib/email-notification-preferences'

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)
const today = () => new Date().toISOString().slice(0, 10)
type Target = { id: string; roomName: string; date: string; type: 'room_checkout_due' | 'rent_overdue'; reason: string; label: string }

export function EmailNotificationPanel({ user, onClose }: { user: AppUser; onClose: () => void }): React.JSX.Element {
  const client = useQueryClient()
  const [targetId, setTargetId] = useState('')
  const [notice, setNotice] = useState('')
  const [allowResend, setAllowResend] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [notificationEmail, setNotificationEmail] = useState(user.notification_email || user.email || '')
  const [enabled, setEnabled] = useState(user.email_notifications_enabled === true)
  const [preferences, setPreferences] = useState<EmailNotificationPreferences>(normalizeEmailNotificationPreferences(user.email_notification_preferences))
  const [gmailAvailability, setGmailAvailability] = useState<{ available: boolean; authenticated?: boolean; reason?: string }>({ available: false })
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: () => getInvoices() })
  const { data: history = [], error } = useQuery({ queryKey: ['email-deliveries', user.id], queryFn: () => getEmailNotificationDeliveries(user.id) })
  useQuery({ queryKey: ['gmail-availability'], queryFn: async () => { const value = await window.api.gmail.getAvailability(); setGmailAvailability(value); return value } })
  const targets = useMemo<Target[]>(() => {
    const result: Target[] = []
    const day = new Date().getDate()
    rooms.forEach((room) => {
      if (room.status === 'ending' && room.expected_end_date && room.expected_end_date <= today()) result.push({ id: `${room.id}:checkout`, roomName: room.name, date: room.expected_end_date, type: 'room_checkout_due', reason: 'Đến hạn trả phòng', label: `Hạn trả ${room.expected_end_date}` })
      const unpaid = invoices.filter((invoice) => invoice.room_id === room.id && invoice.payment_status !== 'paid' && invoice.payment_status !== 'cancelled' && invoice.payment_status !== 'merged').sort((a, b) => `${b.year}-${b.month}`.localeCompare(`${a.year}-${a.month}`))[0]
      if (day >= 15 && (unpaid || Number(room.old_debt || 0) > 0)) result.push({ id: `${room.id}:rent`, roomName: room.name, date: unpaid?.due_date || today(), type: 'rent_overdue', reason: 'Nhắc nợ tiền phòng', label: 'Đã qua ngày 15' })
    })
    return result
  }, [rooms, invoices])
  const target = targets.find((item) => item.id === targetId)
  const dedupeKey = target ? `${user.id}:${target.type}:${target.id}:${target.date}` : ''
  const previous = history.find((item) => item.dedupe_key === dedupeKey)
  const send = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error('Vui lòng chọn một phòng cần gửi.')
      const detail = `${target.reason}: ${target.roomName}. Mốc nhắc: ${target.date}.`
      const result = await sendEmailNotification({ recipientUserId: user.id, eventType: target.type, subject: `[Quản lý phòng trọ] ${target.reason} - ${target.roomName}`, html: `<p>Xin chào ${escapeHtml(user.full_name)},</p><p>${escapeHtml(detail)}</p>`, dedupeKey, payload: { roomId: target.id.split(':')[0], targetDate: target.date, detail }, resend: allowResend })
      if (!result.ok) throw new Error(result.error || 'Không gửi được email.')
      return result
    },
    onSuccess: (result) => { setNotice(result.status === 'skipped' ? 'Cảnh báo này đã được gửi, hệ thống bỏ qua để tránh gửi trùng.' : 'Đã gửi email thành công.'); setAllowResend(false); client.invalidateQueries({ queryKey: ['email-deliveries', user.id] }) },
    onError: (cause) => setNotice(cause instanceof Error ? cause.message : 'Gửi email thất bại.')
  })
  const save = useMutation({ mutationFn: () => updateUserProfile(user.id, { full_name: user.full_name, phone: user.phone || '', notification_email: notificationEmail, email_notifications_enabled: enabled, email_notification_preferences: preferences }), onSuccess: () => { setNotice('Đã lưu cài đặt nhận Gmail.'); client.invalidateQueries({ queryKey: ['users'] }) }, onError: (cause) => setNotice(cause instanceof Error ? cause.message : 'Không lưu được cài đặt.') })
  return <section className="bg-white p-5">
    <div className="flex items-start justify-between gap-3"><div><h4 className="text-base font-black text-[#10233f]">Gmail · Cài đặt và gửi cảnh báo</h4><p className="mt-1 text-xs text-slate-500">Tài khoản: {user.full_name}</p></div><button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-500 hover:bg-slate-100">×</button></div>
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-3"><div className="flex items-center justify-between"><div><p className="text-sm font-black text-[#10233f]">Chọn phòng cần nhắc</p><p className="mt-1 text-xs text-slate-500">Chỉ hiển thị phòng có lý do cảnh báo.</p></div><span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-500">{targets.length} phòng</span></div>{targets.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-500">Hiện chưa có phòng nào cần nhắc.</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{targets.map((item) => <button key={item.id} type="button" onClick={() => { setTargetId(item.id); setNotice(''); setAllowResend(false) }} className={`rounded-xl border p-3 text-left transition ${targetId === item.id ? 'border-[#06603f] bg-[#eaf8f3] ring-2 ring-[#06603f]/10' : 'border-slate-200 bg-white hover:border-[#00ab60]/40'}`}><div className="flex items-center justify-between"><strong className="text-sm text-[#10233f]">{item.roomName}</strong><span className={`h-2.5 w-2.5 rounded-full ${item.type === 'rent_overdue' ? 'bg-rose-500' : 'bg-orange-500'}`} /></div><p className="mt-1 text-xs font-semibold text-slate-600">{item.reason}</p><p className="mt-1 text-[11px] text-slate-400">{item.label}</p></button>)}</div>}</div>
    {target && <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-slate-700"><strong>{target.roomName}</strong> · {target.reason} · mốc {target.date}</p>}
    {previous && <><p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Đã có lượt gửi cho cảnh báo này ({previous.status}).</p><label className="mt-3 flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={allowResend} onChange={(e) => setAllowResend(e.target.checked)} /> Gửi lại có chủ đích</label></>}
    {gmailAvailability.available && !gmailAvailability.authenticated && <button type="button" onClick={async () => { const result = await window.api.gmail.reauthenticate(); if (result.ok) { setGmailAvailability({ available: true, authenticated: true }); setNotice('Đã kết nối Gmail trên máy dev.') } else setNotice(result.error || 'Không kết nối được Gmail.') }} className="mt-3 rounded-xl border border-[#06603f] px-4 py-2.5 text-sm font-bold text-[#06603f]">Kết nối Gmail máy dev</button>}
    {notice && <p role="status" className="mt-3 text-xs font-semibold text-slate-700">{notice}</p>}{gmailAvailability.available && <button type="button" onClick={() => send.mutate()} disabled={!gmailAvailability.authenticated || !target || !user.notification_email || send.isPending || (Boolean(previous) && !allowResend)} className="mt-4 rounded-xl bg-[#06603f] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{send.isPending ? 'Đang gửi...' : 'Gửi email'}</button>}
    <div className="mt-5 border-t border-slate-100 pt-4"><button type="button" onClick={() => setSettingsOpen((value) => !value)} className="flex w-full justify-between text-left text-sm font-black text-[#10233f]">Cài đặt nhận Gmail <span className="text-slate-400">{settingsOpen ? 'Thu gọn' : 'Mở cài đặt'}</span></button>{settingsOpen && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3"><label className="block text-xs font-semibold text-slate-700">Gmail nhận thông báo<input type="email" required value={notificationEmail} onChange={(e) => setNotificationEmail(e.target.value)} placeholder="example@gmail.com" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-[#00ab60] focus:ring-2 focus:ring-[#00ab60]/10" /></label><label className="mt-3 flex items-center justify-between gap-3 text-xs font-semibold text-slate-700">Bật nhận thông báo qua Gmail<input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-emerald-600" /></label><div className="mt-2 space-y-1">{emailNotificationOptions.map(({ key, label }) => <label key={key} className="flex items-center justify-between rounded-lg px-2 py-2 text-xs text-slate-700 hover:bg-white"><span>{label}</span><input type="checkbox" disabled={!enabled} checked={preferences[key]} onChange={(e) => setPreferences((current) => ({ ...current, [key]: e.target.checked }))} className="h-4 w-4 accent-emerald-600 disabled:opacity-40" /></label>)}</div><button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="mt-3 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white">{save.isPending ? 'Đang lưu...' : 'Lưu cài đặt Gmail'}</button></div>}</div>
    <div className="mt-5 border-t border-slate-100 pt-4"><h5 className="text-sm font-black text-[#10233f]">Lịch sử gửi gần đây</h5>{error && <p className="mt-2 text-xs text-rose-600">Lịch sử gửi chưa được thiết lập trên máy chủ.</p>}{history.length === 0 && !error && <p className="mt-2 text-xs text-slate-500">Chưa có lượt gửi nào.</p>}<div className="mt-2 max-h-52 space-y-2 overflow-y-auto">{history.map((item) => <div key={item.id} className="rounded-xl border border-slate-100 px-3 py-2 text-xs"><div className="flex justify-between gap-2"><strong className="text-slate-700">{item.subject}</strong><span className={item.status === 'sent' ? 'text-emerald-700' : 'text-rose-600'}>{item.status === 'sent' ? 'Đã gửi' : item.status}</span></div><p className="mt-1 text-slate-500">{new Date(item.created_at).toLocaleString('vi-VN')}</p></div>)}</div></div>
  </section>
}
