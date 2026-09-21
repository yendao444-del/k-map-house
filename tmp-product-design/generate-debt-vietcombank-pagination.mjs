import { generateImage } from './imagegen-utils.mjs'

const prompt = `Use case: ui-mockup
Asset type: high-fidelity desktop debt-report screen for the AN KHANG HOME Electron app.
Input images: the attached screenshot is the authoritative reference for the existing product shell and debt report layout.
Primary request: Create one polished desktop UI screen that preserves the current report layout and the compact nested-ledger structure of the selected Option A, but gives it a refined Vietcombank-inspired banking identity. Do not use the real Vietcombank logo or trademark; use only a trustworthy emerald banking visual language.
Composition: preserve the green top navigation, report tabs, white report canvas, section header, and one prominent green “+ Thêm giao dịch” button. Show exactly four summary sections: Tổng nợ 400.000.000 đ, Đã trả 18.000.000 đ, Tôi nợ 2.000.000 đ, Còn lại 380.000.000 đ. Expand all three history sections inline as nested tables directly beneath their summary row, like the Kết quả kinh doanh drill-down.
History behavior shown in the mockup: each nested history table displays a maximum of 5 newest transactions. At the bottom of each table show subtle pagination controls with “Trang 1/3”, a disabled “Trước” button, and a green “Sau” button, indicating more pages exist. Include a small outlined “Xem chi tiết” action at the end of each transaction row; show one elegant detail popup open over the page for the Tôi nợ transaction, with fields Ngày, Loại giao dịch, Số tiền, Lý do, and Ghi chú. The popup must look like a real banking detail dialog and remain visually subordinate to the report.
Sample transaction content: Tổng nợ rows include “Khoản nợ ban đầu”, Đã trả rows include “Chuyển khoản tháng 9” and “Thanh toán bổ sung”, Tôi nợ includes “Phí sửa chữa phòng 204” with reason visible. Use Vietnamese text exactly and keep amounts readable.
Style: premium Vietcombank-inspired banking dashboard, deep emerald #006B4F navigation, bright emerald action #00A878, pale mint result row, navy text, restrained amber marker for Tôi nợ, very thin slate separators, soft elevation, compact table density, precise alignment, high trust and financial clarity.
Constraints: no browser chrome, no device frame, no watermark, no charts, no side panels, no extra debt categories, no extra prominent buttons, no dark mode, no random English text, no malformed Vietnamese, no fake Vietcombank logo. Keep the card composition calm and realistic at 1440x1024.`

import { generateImage as generate } from './imagegen-utils.mjs'
await generate({
  outputPath: 'tmp-product-design/debt-vietcombank-pagination-popup.png',
  prompt,
  referencePaths: ['C:/Users/Admin/AppData/Local/Temp/codex-clipboard-8af74a17-c8a0-4345-9790-91c7104bcb52.png'],
  size: '1440x1024'
})
