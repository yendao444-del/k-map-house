import type { AppUser, Invoice, Room } from './db'
import { buildNotificationEmailLayout } from './payment-success-email'
export { escapeEmailHtml } from './email-html'
import {
  normalizeEmailNotificationPreferences,
  type EmailNotificationPreferences
} from './email-notification-preferences'

export type NotificationType = keyof EmailNotificationPreferences
export type ManualEmailTarget = {
  id: string
  roomName: string
  date: string
  type: 'room_checkout_due' | 'rent_overdue'
  reason: string
  label: string
}

export const notificationSupport: Record<
  NotificationType,
  { mode: 'automatic' | 'manual' | 'template'; label: string }
> = {
  room_checkout_due: { mode: 'manual', label: 'Có luồng gửi thủ công' },
  rent_overdue: { mode: 'manual', label: 'Có luồng gửi thủ công' },
  rent_long_unpaid: { mode: 'template', label: 'Chưa có luồng gửi thực tế; chỉ có mẫu kiểm thử' },
  sepay_unmatched: { mode: 'automatic', label: 'Có luồng SePay tự động trên máy dev' },
  sepay_matched: { mode: 'automatic', label: 'Có luồng SePay tự động trên máy dev' },
  invoices_services: { mode: 'template', label: 'Chưa có luồng gửi thực tế; chỉ có mẫu kiểm thử' },
  contract_expiring: { mode: 'template', label: 'Chưa có luồng gửi thực tế; chỉ có mẫu kiểm thử' }
}

export function emailRecipientDecision(
  user: Pick<
    AppUser,
    | 'status'
    | 'notification_email'
    | 'email_notifications_enabled'
    | 'email_notification_preferences'
  >,
  type: NotificationType
): { allowed: boolean; reason: string } {
  if (user.status !== 'active') return { allowed: false, reason: 'Tài khoản không hoạt động.' }
  if (!user.notification_email?.trim())
    return { allowed: false, reason: 'Chưa lưu email nhận thông báo.' }
  if (!user.email_notifications_enabled)
    return { allowed: false, reason: 'Đã tắt nhận thông báo qua Gmail.' }
  if (!normalizeEmailNotificationPreferences(user.email_notification_preferences)[type])
    return { allowed: false, reason: 'Đã tắt loại thông báo này.' }
  return { allowed: true, reason: 'Tài khoản đã bật nhận loại thông báo này.' }
}

export function emailDeliveryDecision(
  user: AppUser,
  type: NotificationType,
  key: string,
  completed: ReadonlySet<string>,
  gmail: { available: boolean; authenticated?: boolean }
): { status: 'ready' | 'blocked' | 'duplicate'; reason: string } {
  const recipient = emailRecipientDecision(user, type)
  if (!recipient.allowed) return { status: 'blocked', reason: recipient.reason }
  if (!gmail.available || !gmail.authenticated)
    return { status: 'blocked', reason: 'Gmail máy dev chưa kết nối hoặc không khả dụng.' }
  if (completed.has(key))
    return { status: 'duplicate', reason: 'Bỏ qua vì thông báo này đã được gửi.' }
  return { status: 'ready', reason: 'Đủ điều kiện gửi thông báo.' }
}

export function getManualEmailTargets(
  rooms: Room[],
  invoices: Invoice[],
  now = new Date()
): ManualEmailTarget[] {
  const result: ManualEmailTarget[] = []
  const today = now.toISOString().slice(0, 10)
  rooms.forEach((room) => {
    if (room.status === 'ending' && room.expected_end_date && room.expected_end_date <= today)
      result.push({
        id: `${room.id}:checkout`,
        roomName: room.name,
        date: room.expected_end_date,
        type: 'room_checkout_due',
        reason: 'Đến hạn trả phòng',
        label: `Hạn trả ${room.expected_end_date}`
      })
    const unpaid = invoices
      .filter(
        (invoice) =>
          invoice.room_id === room.id &&
          !['paid', 'cancelled', 'merged'].includes(invoice.payment_status)
      )
      .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month))[0]
    if (now.getDate() >= 15 && (unpaid || Number(room.old_debt || 0) > 0))
      result.push({
        id: `${room.id}:rent`,
        roomName: room.name,
        date: unpaid?.due_date || today,
        type: 'rent_overdue',
        reason: 'Nhắc nợ tiền phòng',
        label: 'Đã qua ngày 15'
      })
  })
  return result
}

export function buildManualReminderEmail(
  target: ManualEmailTarget,
  name: string
): { subject: string; html: string; detail: string } {
  const detail = `${target.reason}: ${target.roomName}. Mốc nhắc: ${target.date}.`
  return {
    subject: `[Quản lý phòng trọ] ${target.reason} - ${target.roomName}`,
    html: buildNotificationEmailLayout({
      title: target.reason,
      recipientName: name,
      tone: target.type === 'rent_overdue' ? 'warning' : 'reminder',
      statusLabel: target.type === 'rent_overdue' ? 'NHẮC CÔNG NỢ' : 'NHẮC TRẢ PHÒNG',
      introduction:
        target.type === 'rent_overdue'
          ? `${target.roomName} còn khoản nợ chưa thanh toán.`
          : `${target.roomName} đã đến hạn trả phòng.`,
      highlight: target.date,
      highlightLabel: 'Mốc nhắc',
      compact: true,
      rows: [['Phòng', target.roomName]],
      conclusion:
        target.type === 'rent_overdue'
          ? 'Vui lòng kiểm tra và thu hồi công nợ.'
          : 'Vui lòng kiểm tra kế hoạch trả phòng và bàn giao.'
    }),
    detail
  }
}

export const manualEmailKey = (target: ManualEmailTarget, userId: string): string =>
  `${userId}:${target.type}:${target.id}:${target.date}`
