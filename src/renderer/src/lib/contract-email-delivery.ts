type PreparedConfirmation = { email: string; id: string }
type SendResult = { ok: boolean; error?: string; notSent?: boolean; messageId?: string }

export type ContractEmailResult = {
  outcome: 'success' | 'failed' | 'uncertain'
  title: string
  message: string
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export async function saveAndDeliverContractEmail<Draft>(operations: {
  save: () => Promise<Draft>
  prepare: (draft: Draft) => Promise<PreparedConfirmation>
  send: (confirmation: PreparedConfirmation) => Promise<SendResult>
  mark: (draft: Draft, confirmation: PreparedConfirmation, messageId?: string, failed?: boolean) => Promise<void>
}): Promise<ContractEmailResult> {
  let draft!: Draft
  return deliverContractEmail({
    prepare: async () => { draft = await operations.save(); return operations.prepare(draft) },
    send: operations.send,
    mark: (confirmation, messageId, failed) => operations.mark(draft, confirmation, messageId, failed)
  })
}

// A prepared link reserves this delivery. After calling Gmail, only an explicit
// rejection permits retry; a lost response must never be presented as not sent.
export async function deliverContractEmail(operations: {
  prepare: () => Promise<PreparedConfirmation>
  send: (confirmation: PreparedConfirmation) => Promise<SendResult>
  mark: (confirmation: PreparedConfirmation, messageId?: string, failed?: boolean) => Promise<void>
}): Promise<ContractEmailResult> {
  let confirmation: PreparedConfirmation
  try { confirmation = await operations.prepare() }
  catch (error) {
    return { outcome: 'failed', title: 'Chưa gửi được Gmail', message: errorMessage(error, 'Chưa tạo được link xác nhận hợp đồng.') }
  }
  let result: SendResult
  try { result = await operations.send(confirmation) }
  catch (error) {
    return { outcome: 'uncertain', title: 'Chưa xác định được kết quả gửi', message: `${errorMessage(error, 'Mất kết nối trong lúc gửi Gmail.')} Kiểm tra hộp thư ${confirmation.email} trước khi gửi lại để tránh gửi trùng.` }
  }
  if (!result.ok) {
    if (!result.notSent) return { outcome: 'uncertain', title: 'Chưa xác định được kết quả gửi', message: `${result.error || 'Gmail chưa trả kết quả gửi.'} Kiểm tra hộp thư ${confirmation.email} trước khi gửi lại để tránh gửi trùng.` }
    let trackingError = ''
    try { await operations.mark(confirmation, undefined, true) }
    catch { trackingError = ' Chưa lưu được trạng thái lỗi; cần kiểm tra kết nối trước khi thử lại.' }
    return { outcome: 'failed', title: 'Gửi Gmail thất bại', message: `${result.error || 'Gmail từ chối gửi thư.'} Thư chưa được gửi tới ${confirmation.email}.${trackingError}` }
  }
  try { await operations.mark(confirmation, result.messageId) }
  catch {
    return { outcome: 'uncertain', title: 'Gmail đã nhận thư · Chưa lưu được trạng thái', message: `Gmail đã tiếp nhận thư gửi tới ${confirmation.email}, nhưng hệ thống chưa cập nhật được trạng thái. Kiểm tra hộp thư trước khi gửi lại để tránh gửi trùng.` }
  }
  return { outcome: 'success', title: 'Đã gửi Gmail thành công', message: `Đã gửi link xác nhận hợp đồng tới ${confirmation.email}. Link có hiệu lực 72 giờ. Đang chờ khách xác nhận; hợp đồng chưa được kích hoạt.` }
}
