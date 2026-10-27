export interface SepayReconciliation {
  status: 'none' | 'code' | 'invalid' | 'recorded' | 'suggestion' | 'paid' | 'manual-review' | 'ambiguous'
  invoiceId?: string
  roomName?: string
  tenantName?: string
  remaining?: number
  month?: number
  year?: number
}

export function describeSepayReconciliation(result?: SepayReconciliation): {
  status: 'ok' | 'warn' | 'error'; title: string; detail: string
} | undefined {
  switch (result?.status) {
    case 'suggestion': return { status: 'warn', title: 'Gợi ý ghép theo tên khách', detail: 'Khớp họ tên khách trên hóa đơn, đúng số còn thu và kỳ thanh toán (cho phép sớm hoặc muộn 7 ngày). Kiểm tra nội dung gốc rồi duyệt thủ công.' }
    case 'paid': return { status: 'warn', title: 'Có thể đã thu trước đó', detail: 'Tên khách, số tiền và kỳ thanh toán khớp một hóa đơn đã thu đủ. Cần kiểm tra khoản thu cũ; không ghi thêm tiền.' }
    case 'manual-review': return { status: 'warn', title: 'Có khoản thu thủ công cùng số tiền', detail: 'Hóa đơn đã có khoản thu chuyển khoản cùng số tiền nhưng thiếu mã ngân hàng. Kiểm tra khoản thu cũ để tránh ghi trùng.' }
    case 'ambiguous': return { status: 'warn', title: 'Có nhiều hóa đơn có thể khớp', detail: 'Tên khách, số tiền và thời gian khớp nhiều hóa đơn. Chưa đủ căn cứ để ghép hoặc ghi thêm vào sổ ngân hàng.' }
    case 'recorded': return { status: 'ok', title: 'Đã ghi nhận giao dịch', detail: 'Máy chủ đã ghi nhận mã giao dịch này vào hóa đơn hoặc sổ ngân hàng.' }
    case 'invalid': return { status: 'error', title: 'Chưa đủ điều kiện xác minh', detail: 'Tài khoản nhận, ngày hoặc dữ liệu giao dịch chưa hợp lệ. Không ghi nhận tiền từ giao dịch này.' }
    default: return undefined
  }
}
