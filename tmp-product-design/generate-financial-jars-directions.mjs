import { generateImage } from './imagegen-utils.mjs'

const direction = process.argv[2]
const outputVariant = process.argv[3]
const jobs = {
  modal: {
    outputPath: './tmp-product-design/financial-jars-direction-a.png',
    prompt: `Use case: ui-mockup. Asset type: desktop Vietnamese financial dashboard, focused allocation modal.
Primary request: use the attached wallet screen as the authoritative reference and show the user opening a clear “Phân bổ vào hũ” workflow. Preserve the existing green desktop shell, logo, top navigation, rounded white surfaces, and Vietnamese typography. Keep the current wallet balance visible in the background: “Tiền hiện có 20.215.732 đ”, “Ngân hàng 15.215.732 đ”, “Tiền mặt 5.000.000 đ”. In the foreground, create one premium modal titled “Phân bổ vào hũ”, with source “Ví ngân hàng · 15.215.732 đ”, destination cards for “Sinh hoạt”, “Trả nợ”, “Bảo trì”, “Dự phòng”, “Tái đầu tư”, a prominent amount field showing “5.000.000 đ”, a short note field, and a single primary button “Xác nhận phân bổ”. Show a small before/after summary: “Ví ngân hàng còn lại 10.215.732 đ” and “Hũ Sinh hoạt 5.000.000 đ”. This is a focused interaction screen, not a full feature inventory.
Text (verbatim): “Ví tiền”, “Tiền hiện có”, “Phân bổ vào hũ”, “Ví ngân hàng”, “Sinh hoạt”, “Trả nợ”, “Bảo trì”, “Dự phòng”, “Tái đầu tư”, “Số tiền phân bổ”, “Ghi chú”, “Xác nhận phân bổ”, “Ví ngân hàng còn lại”, “Hũ Sinh hoạt”.
Current date: 22/09/2026. Target dimensions: 1440 x 1024 desktop.
Avoid: browser chrome, phone frame, purple, dark mode, invented navigation, multiple modals, malformed Vietnamese, clipped text, fake charts, percentages without money amounts, unrelated branding, watermarks.`
  },
  dashboard: {
    outputPath: './tmp-product-design/financial-jars-direction-b.png',
    prompt: `Use case: ui-mockup. Asset type: desktop Vietnamese financial dashboard, hũ tài chính management screen.
Primary request: redesign the main wallet content into a clear “Hũ tài chính” management view while preserving the attached wallet screen's green application shell, top navigation, logo, spacing language, and rounded card design. Make the primary action “+ Phân bổ vào hũ”. At the top show “Tiền hiện có 20.215.732 đ” with “Ngân hàng 15.215.732 đ” and “Tiền mặt 5.000.000 đ”. The main area should be one grouped allocation surface titled “Các hũ tài chính”, with rows for “Sinh hoạt 5.000.000 đ”, “Trả nợ 2.000.000 đ”, “Bảo trì 1.200.000 đ”, “Dự phòng 2.000.000 đ”, and “Tái đầu tư 1.500.000 đ”. Each row should communicate balance and a restrained “Rút tiền” or overflow action without adding clutter. Add a compact right column titled “Lịch sử phân bổ” with dates and movements such as “22/09/2026 · +5.000.000 đ · Hũ Sinh hoạt” and “20/09/2026 · +2.000.000 đ · Hũ Trả nợ”. Emphasize that these are internal allocations, not expenses.
Text (verbatim): “Ví tiền”, “Hũ tài chính”, “Tiền hiện có”, “Các hũ tài chính”, “Sinh hoạt”, “Trả nợ”, “Bảo trì”, “Dự phòng”, “Tái đầu tư”, “Phân bổ vào hũ”, “Lịch sử phân bổ”, “Phân bổ nội bộ — không phải chi phí”.
Current date: 22/09/2026. Target dimensions: 1440 x 1024 desktop.
Avoid: browser chrome, phone frame, purple, dark mode, percentage-only charts, misleading profit labels, fake accounting entries, malformed Vietnamese, clipped text, duplicated panels, unrelated branding, watermarks.`
  },
  ledger: {
    outputPath: './tmp-product-design/financial-jars-direction-c.png',
    prompt: `Use case: ui-mockup. Asset type: desktop Vietnamese financial dashboard, cash allocation ledger.
Primary request: use the attached wallet screen as the authoritative visual reference but explore a ledger-first interaction for “Hũ tài chính”. Preserve the green desktop shell, navigation, logo, white surfaces, and compact business dashboard density. Show a top balance strip with “Tiền hiện có 20.215.732 đ” and a clear primary button “Phân bổ tiền”. Below, show a two-column work area: left column “Các hũ” with compact balances for “Sinh hoạt”, “Trả nợ”, “Bảo trì”, “Dự phòng”, “Tái đầu tư”; right column “Dòng chuyển nội bộ” as a chronological ledger. Include realistic entries: “22/09/2026 · Ví ngân hàng → Hũ Sinh hoạt · 5.000.000 đ”, “20/09/2026 · Ví ngân hàng → Hũ Trả nợ · 2.000.000 đ”, “18/09/2026 · Hũ Bảo trì → Ví tiền mặt · 800.000 đ”. Add a visible helper line “Phân bổ vào hũ không làm thay đổi tổng tiền và không ghi nhận là chi phí”. Keep only one or two supporting actions and prioritize traceability.
Text (verbatim): “Ví tiền”, “Tiền hiện có”, “Phân bổ tiền”, “Các hũ”, “Sinh hoạt”, “Trả nợ”, “Bảo trì”, “Dự phòng”, “Tái đầu tư”, “Dòng chuyển nội bộ”, “Phân bổ vào hũ không làm thay đổi tổng tiền và không ghi nhận là chi phí”.
Current date: 22/09/2026. Target dimensions: 1440 x 1024 desktop.
Avoid: browser chrome, phone frame, purple, dark mode, noisy analytics, arbitrary percentages, malformed Vietnamese, clipped text, invented modules, unrelated branding, watermarks.`
  }
}

if (!jobs[direction]) throw new Error(`Unknown direction: ${direction}`)
const outputPath = outputVariant
  ? jobs[direction].outputPath.replace(/\.png$/i, `-${outputVariant}.png`)
  : jobs[direction].outputPath
await generateImage({
  outputPath,
  referencePaths: ['./tmp-product-design/wallet-demo.png'],
  size: '1440x1024',
  prompt: jobs[direction].prompt
})
