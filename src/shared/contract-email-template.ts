import { buildNotificationEmailLayout } from './notification-email-layout'

// Retained for older stored messages and their CID attachment.
export const CONTRACT_BANNER_CID = 'contract-confirmation-banner@ankhanghome'
export type ContractEmailInput = { tenantName: string; room: string; url: string; moveInDate?: string; amendment?: boolean }

export function contractEmailHtml(input: ContractEmailInput): string {
  const date = input.moveInDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const rows: Array<[string,string]> = [['Phòng', input.room]]
  if (date) rows.push(['Ngày bắt đầu', `${date[3]}/${date[2]}/${date[1]}`])
  return buildNotificationEmailLayout({
    template: input.amendment ? '16-xac-nhan-sua-hop-dong' : '01-xac-nhan-hop-dong',
    title: input.amendment ? 'Xác nhận bản sửa' : 'Xác nhận hợp đồng',
    recipientName: input.tenantName,
    introduction: `${input.amendment ? 'Bản sửa hợp đồng' : 'Hợp đồng thuê'} phòng ${input.room} đã sẵn sàng để bạn xem và xác nhận.`,
    rows,
    conclusion: input.amendment
      ? 'Hợp đồng hiện tại vẫn có hiệu lực đến khi bạn xác nhận bản sửa. Vui lòng kiểm tra các thay đổi trước khi đồng ý.'
      : 'Vui lòng kiểm tra thông tin cá nhân và điều khoản trước khi xác nhận.',
    action: { label: input.amendment ? 'Xem và xác nhận bản sửa' : 'Xem và xác nhận hợp đồng', url: input.url, note: 'Link có hiệu lực 72 giờ và chỉ sử dụng một lần.' }
  })
}
