import fs from 'node:fs/promises'
import { generateImage } from './imagegen-utils.mjs'

const reference = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-8af74a17-c8a0-4345-9790-91c7104bcb52.png'
const shared = `Use case: ui-mockup
Asset type: premium desktop debt report UI for AN KHANG HOME.
Use the attached screenshot as the authoritative reference. Preserve the exact green application shell, top navigation, report tabs, white report canvas, compact Vietnamese business-report table style, and a single “+ Thêm giao dịch” button. Show exactly four summary rows: Tổng nợ 400.000.000 đ, Đã trả 18.000.000 đ, Tôi nợ 2.000.000 đ, Còn lại 380.000.000 đ. No browser chrome, device frame, watermark, charts, side panel, or unrelated widgets. Keep all Vietnamese text crisp and correctly spelled.`

const variants = [
  {
    outputPath: 'tmp-product-design/debt-history-premium-compact.png',
    prompt: `${shared}\nCreate a premium compact ledger variant. Expand the three history sections inline below their summary rows, but use a refined nested table with very light blue header, exact columns Ngày / Nội dung / Số tiền, hairline separators, generous horizontal alignment, and subtle disclosure chevrons. Use stronger navy typography, quieter borders, a restrained emerald paid state, amber offset state, and a mint double-border Còn lại row. Make it feel like a polished private-banking report without making the card tall or crowded.`
  },
  {
    outputPath: 'tmp-product-design/debt-history-premium-balanced.png',
    prompt: `${shared}\nCreate a premium balanced variant inspired by the spacious option. Keep the four summary rows compact with a small secondary description and a discreet “Xem lịch sử” text affordance aligned at far right. Show one elegant inline preview line beneath each of Tổng nợ, Đã trả, and Tôi nợ, including date, reason, and amount; do not use separate bulky cards. Make the Tôi nợ reason “Phí sửa chữa phòng 204” clearly readable with a soft amber tint. Keep Còn lại as the strongest mint-highlighted result row. The final composition should feel calm, precise, and executive.`
  }
]

for (const variant of variants) {
  await generateImage({ outputPath: variant.outputPath, prompt: variant.prompt, referencePaths: [reference], size: '1440x1024' })
}
