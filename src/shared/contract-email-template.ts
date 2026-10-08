export const CONTRACT_BANNER_CID = 'contract-confirmation-banner@ankhanghome'

export type ContractEmailInput = { tenantName: string; room: string; url: string; moveInDate?: string; amendment?: boolean }

export function contractEmailHtml(input: ContractEmailInput): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)
  const date = input.moveInDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const dateRow = date ? `<tr><td style="padding:14px 0;border-bottom:1px solid #dce5df;color:#697a72;width:38%">Ngày bắt đầu</td><td style="padding:14px 0;border-bottom:1px solid #dce5df;font-weight:700">${date[3]}/${date[2]}/${date[1]}</td></tr>` : ''
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media only screen and (max-width:480px){.contract-email-body{padding:24px 20px!important}.contract-email-action{display:block!important;padding:16px 12px!important;font-size:16px!important}.contract-email-shell{border-radius:0!important}}</style></head>
<body style="margin:0;padding:0;background:#ffffff;color:#15231d;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">Hợp đồng phòng ${escape(input.room)} đã sẵn sàng. Vui lòng xem và xác nhận trong 72 giờ.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;background:#ffffff"><tr><td align="center" style="padding:12px 0">
<table class="contract-email-shell" role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #edf0ee;border-radius:6px;overflow:hidden">
<tr><td style="padding:0"><img src="cid:${CONTRACT_BANNER_CID}" width="600" alt="An Khang Home — Xác nhận hợp đồng" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>
<tr><td class="contract-email-body" style="padding:24px 40px 28px;font-size:16px;line-height:1.65;color:#15231d">
<p style="margin:0 0 14px">Xin chào <strong>${escape(input.tenantName)}</strong>,</p>
<p style="margin:0 0 22px">${input.amendment ? 'Bản sửa hợp đồng' : 'Hợp đồng thuê'} phòng <strong>${escape(input.room)}</strong> đã sẵn sàng để bạn xem và xác nhận.</p>
${input.amendment ? '<p style="margin:0 0 22px;color:#007749">Vui lòng kiểm tra các thay đổi cũ → mới trên trang xác nhận. Bản hiện tại vẫn có hiệu lực đến khi bạn xác nhận bản sửa; hóa đơn và thanh toán đã ghi nhận được giữ nguyên.</p>' : ''}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;font-size:16px;line-height:1.5;color:#15231d;margin:0 0 24px"><tr><td style="padding:14px 0;border-bottom:1px solid #dce5df;color:#697a72;width:38%">Phòng</td><td style="padding:14px 0;border-bottom:1px solid #dce5df;font-weight:700">${escape(input.room)}</td></tr>${dateRow}</table>
<p style="margin:0 0 24px">Vui lòng kiểm tra thông tin cá nhân và điều khoản trước khi xác nhận.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center"><a class="contract-email-action" href="${escape(input.url)}" style="display:inline-block;max-width:100%;box-sizing:border-box;padding:16px 28px;background:#00ab60;color:#ffffff;border-radius:9px;text-decoration:none;font-size:18px;font-weight:700;line-height:1.35;text-align:center">Xem và xác nhận hợp đồng</a></td></tr></table>
<p style="margin:14px 0 26px;text-align:center;color:#697a72;font-size:13px;line-height:1.6">Link có hiệu lực 72 giờ và chỉ sử dụng một lần.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse"><tr><td style="border-top:1px solid #dce5df;padding-top:22px;font-size:16px;line-height:1.6">Trân trọng,<br><strong>Đội ngũ An Khang Home</strong></td></tr></table>
<p style="margin:22px 0 0;font-size:12px;line-height:1.65;color:#697a72">Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email và liên hệ chủ nhà.</p>
</td></tr></table></td></tr></table></body></html>`
}
