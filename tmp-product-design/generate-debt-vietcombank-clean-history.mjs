import { generateImage } from './imagegen-utils.mjs'

const prompt = `Use case: ui-mockup
Asset type: high-fidelity desktop debt report UI for AN KHANG HOME.
Input images: the attached screenshot is the authoritative reference for the existing app shell and debt-report composition.
Create one polished Vietnamese desktop screen based on the selected Option A nested ledger and the latest attached annotation. Preserve the green application shell, report tabs, white report canvas, compact Kết quả kinh doanh-style table, and one prominent “+ Thêm giao dịch” button. Use a refined Vietcombank-inspired banking identity without using any real Vietcombank logo or trademark: deep emerald navigation, clean emerald action, navy text, pale blue table headers, pale mint result row, amber Tôi nợ marker.
Keep exactly four summary sections and these values: Tổng nợ 400.000.000 đ, Đã trả 18.000.000 đ, Tôi nợ 2.000.000 đ, Còn lại 380.000.000 đ. Expand the first three sections with nested transaction history tables.
Critical layout changes: completely remove the Ghi chú column from every nested history table. Each nested table must have exactly four columns: Ngày, Loại giao dịch, Số tiền, Lý do. At the bottom of each nested table, show only one outlined green “Xem chi tiết” button for the whole section, placed beside pagination controls “Trang 1/3”, “Trước”, “Sau”. Do not put Xem chi tiết buttons inside individual transaction rows. Show the Tôi nợ reason “Phí sửa chữa phòng 204” clearly in the Lý do column.
Use realistic transaction rows and crisp Vietnamese text. Keep the history tables compact, aligned, and premium. No popup open in this mockup; the single bottom button is the entry point for the detail popup. No browser chrome, device frame, watermark, charts, side panels, extra prominent buttons, random English, malformed Vietnamese, or extra columns.`

import { generateImage as generate } from './imagegen-utils.mjs'
await generate({
  outputPath: 'tmp-product-design/debt-vietcombank-clean-history.png',
  prompt,
  referencePaths: ['C:/Users/Admin/AppData/Local/Temp/codex-clipboard-2cb5184b-dc1b-4f87-86df-0a091be5ba31.png'],
  size: '1440x1024'
})
