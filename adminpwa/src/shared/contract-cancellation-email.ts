import { buildNotificationEmailLayout } from './notification-email-layout'
export type CancellationEmail = { tenant_name: string; room_name: string; reason: string; cancelled_at: string; contract_id: string }
export function cancellationEmailHtml(input: CancellationEmail): string {
  const testContract = input.reason.startsWith('Kết thúc hợp đồng thử nghiệm.')
  const time = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(input.cancelled_at))
  return buildNotificationEmailLayout({
    template: '17-thong-bao-huy-hop-dong', title: 'Thông báo hủy hợp đồng', compact: true,
    recipientName: input.tenant_name,
    introduction: `Hợp đồng phòng ${input.room_name} đã được hủy ${testContract ? 'để kết thúc thử nghiệm' : 'do lập nhầm'}.`,
    rows: [['Phòng', input.room_name], ['Mã hợp đồng', input.contract_id], ['Thời điểm hủy', time + ' (GMT+7)'], ['Lý do', input.reason]],
    conclusion: 'Bản hợp đồng và link xác nhận cũ không còn hiệu lực. Bạn không cần xác nhận hay thao tác thêm.'
  })
}
// Delivery errors never undo an already committed cancellation.
export async function deliverCancellationNotice<T extends CancellationEmail & { recipient: string; claimed: boolean; attempt_id: string; status?: string }>(dependencies: {
  claim: () => Promise<T>; send: (notice: T) => Promise<{ ok: boolean; messageId?: string; notSent?: boolean; error?: string }>;
  mark: (notice: T, outcome: 'sent' | 'failed' | 'uncertain', messageId?: string, error?: string) => Promise<unknown>
}): Promise<string> {
  const notice = await dependencies.claim()
  if (!notice.claimed) return notice.status === 'sent' ? 'Đã gửi email thông báo hủy.' : 'Thông báo đang gửi hoặc chưa rõ kết quả. Kiểm tra thư đã gửi trước khi xử lý tiếp.'
  let result: { ok: boolean; messageId?: string; notSent?: boolean; error?: string }
  try { result = await dependencies.send(notice) }
  catch { result = { ok: false, error: 'Mất kết nối khi gửi Gmail; chưa xác định thư đã gửi hay chưa.' } }
  const outcome = result.ok && result.messageId ? 'sent' : result.notSent ? 'failed' : 'uncertain'
  try { await dependencies.mark(notice, outcome, result.messageId, result.error) }
  catch { return 'Hợp đồng đã hủy; chưa lưu được kết quả gửi email. Kiểm tra Gmail đã gửi trước khi thử lại.' }
  return outcome === 'sent' ? `Đã gửi email thông báo hủy tới ${notice.recipient}.` : outcome === 'failed' ? `Hợp đồng đã hủy; email chưa gửi: ${result.error || 'Gmail từ chối'}. Có thể gửi lại thông báo.` : 'Hợp đồng đã hủy; chưa rõ kết quả gửi email. Kiểm tra Gmail đã gửi trước khi gửi lại.'
}

