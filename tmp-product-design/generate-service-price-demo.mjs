import { generateImage } from './imagegen-utils.mjs'

const reference = 'G:/PHONG TRO/app/audit/service-price-zone/01-vung-gia-dich-vu.png'

await generateImage({
  outputPath: './service-price-zone-demo.png',
  referencePaths: [reference],
  size: '1440x1024',
  prompt: `Use case: ui-mockup. Asset type: polished desktop Vietnamese property-management admin screen.
Primary request: redesign the authoritative “Vùng giá dịch vụ” screen for An Khang Home while preserving the existing green desktop application shell, logo treatment, top navigation, left settings navigation, Vietnamese language, white surfaces, rounded corners, and restrained business-admin density.
Make the main content feel more informative and intentional: title “Vùng giá dịch vụ” with helper text, a green “Thêm vùng giá” button, three compact summary metrics for “5 vùng giá”, “24 phòng áp dụng”, and “Cập nhật gần nhất: hôm nay”, followed by a search field and light status filter. Use one grouped table with clear headers “Tên vùng”, “Tiền điện”, “Tiền nước”, “Internet”, “Rác”, “Phòng áp dụng”, “Cập nhật”, and “Thao tác”. Show readable Vietnamese values with units: “3.200 ₫/kWh”, “35.000 ₫/m³”, “50.000 ₫/tháng”, “70.000 ₫/phòng”; show room counts as links or subtle pills, an “Đang áp dụng” status, and small text actions “Sửa” and “Xem phòng”. Include a slim right-side edit drawer for “Chỉnh sửa vùng giá” with four price inputs, effective date, affected rooms summary, and a primary “Lưu thay đổi” button, as if the drawer is open from the selected row.
Create one coherent screen at 1440 x 1024 with crisp Vietnamese labels, strong hierarchy, balanced whitespace, accessible contrast, and precise alignment. Keep the table and drawer visually integrated rather than adding unrelated modules.
Avoid: browser chrome, device frame, dark mode, purple, neon gradients, oversized illustrations, unrelated branding, malformed Vietnamese, clipped text, duplicated panels, fake charts, extra pages, excessive cards, ambiguous currency units, and changing the existing logo or navigation.`
})
