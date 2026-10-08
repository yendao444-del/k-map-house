const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)
export type CancellationEmail = { tenant_name: string; room_name: string; reason: string; cancelled_at: string; contract_id: string }
export function cancellationEmailHtml(input: CancellationEmail): string {
  const testContract = input.reason.startsWith('Kết thúc hợp đồng thử nghiệm.')
  const time = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(input.cancelled_at))
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f5f8f6;font-family:Arial,sans-serif;color:#15231d"><table role="presentation" width="100%"><tr><td align="center" style="padding:20px 12px"><table role="presentation" width="600" style="width:100%;max-width:600px;background:white;border-radius:12px;border:1px solid #dce5df"><tr><td style="padding:24px;background:#007749;color:white;font-weight:bold;font-size:22px">AN KHANG HOME</td></tr><tr><td style="padding:24px;line-height:1.7"><h1 style="font-size:22px;margin:0 0 20px">Thông báo hủy hợp đồng ${testContract ? 'thử nghiệm' : 'do lập nhầm'}</h1><p>Xin chào <strong>${escape(input.tenant_name)}</strong>,</p><p>Admin đã hủy hợp đồng phòng <strong>${escape(input.room_name)}</strong> ${testContract ? 'để kết thúc thử nghiệm' : 'do lập nhầm'}.</p><p><strong>Mã hợp đồng:</strong> ${escape(input.contract_id)}<br><strong>Thời điểm:</strong> ${escape(time)} (GMT+7)</p><div style="padding:16px;background:#f0f8f3;border-left:3px solid #00ab60"><strong>Lý do:</strong><br>${escape(input.reason).replace(/\n/g,'<br>')}</div><p>Bản hợp đồng và link xác nhận cũ không còn hiệu lực. Bạn không cần xác nhận hay thao tác thêm.</p><p>Nếu thông tin này chưa đúng, vui lòng liên hệ chủ nhà hoặc trả lời email này.</p><p style="border-top:1px solid #dce5df;padding-top:16px">Trân trọng,<br><strong>Đội ngũ An Khang Home</strong></p></td></tr></table></td></tr></table></body></html>`
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
