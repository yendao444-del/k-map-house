import fs from 'node:fs/promises'
import { generateImage } from './imagegen-utils.mjs'

const reference = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-8af74a17-c8a0-4345-9790-91c7104bcb52.png'
const base = `Use case: ui-mockup
Asset type: desktop AN KHANG HOME debt-report product design reference.
Input images: the attached screenshot is the authoritative product shell and existing Nợ report.
Preserve the green top navigation, report tabs, Vietnamese copy, white desktop canvas, compact business-report table style, and one prominent “+ Thêm giao dịch” button. Use exact sample values: Tổng nợ 400.000.000 đ, Đã trả 18.000.000 đ, Tôi nợ 2.000.000 đ, Còn lại 380.000.000 đ. Keep exactly four summary sections and no side panels, charts, browser chrome, device frame, watermark, or extra actions. All visible text must be crisp Vietnamese.`

const variants = [
  {
    name: 'debt-history-variant-compact.png',
    prompt: `${base}\nVariant direction: compact nested ledger. Expand all three transaction rows, but make each history a very slim two-column inline ledger directly below its summary row. Use small date and description text, thin pale-blue separators, minimal vertical height, and preserve a lot of clean whitespace below the card. The result should feel like the existing Kết quả kinh doanh drill-down table, but lighter and more premium.`
  },
  {
    name: 'debt-history-variant-offset-focus.png',
    prompt: `${base}\nVariant direction: offset-focused. Keep Tổng nợ and Đã trả histories collapsed with a subtle chevron, expand Tôi nợ by default, and make its reason “Phí sửa chữa phòng 204” clearly readable in a warm amber-tinted inline detail row. Keep Còn lại strongly highlighted in pale mint. The screen should communicate why the cash transfer is reduced from 20.000.000 đ to 18.000.000 đ.`
  },
  {
    name: 'debt-history-variant-balanced.png',
    prompt: `${base}\nVariant direction: balanced premium ledger. Show all four summary rows with compact history disclosure controls; show one concise preview line under each of the first three rows and use a neat “Xem lịch sử” affordance at the right. Keep the card height balanced and avoid a long page. Use refined navy typography, emerald paid state, amber offset state, and a restrained double-border result row.`
  }
]

for (const variant of variants) {
  await generateImage({
    outputPath: `tmp-product-design/${variant.name}`,
    prompt: variant.prompt,
    referencePaths: [reference],
    size: '1440x1024'
  })
}
