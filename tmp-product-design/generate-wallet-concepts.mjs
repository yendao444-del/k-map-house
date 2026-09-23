import { generateImage } from './imagegen-utils.mjs'

const reference = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-b0a5c86a-15ed-41c2-945e-4f32f55a1a2e.png'
const jobs = [
  {
    outputPath: './wallet-concept-a.png',
    prompt: `Use case: ui-mockup. Asset type: desktop Vietnamese financial dashboard concept.
Primary request: create a balanced Ví tiền screen for An Khang Home. Preserve the authoritative reference's green desktop shell, top navigation, logo treatment, white rounded cards, and compact financial density. The main content should clearly show the page title Ví tiền, total available money 20.215.732 đ, a small Khớp sổ sách status, a reconciliation card with Chênh lệch cần xử lý 0 đ, two wallet cards for Vietcombank · Sepay 15.215.732 đ and Tiền mặt tại quỹ 5.000.000 đ, then a lower split section for Đã phân bổ vào hũ tài chính and Biến động gần đây. Use polished green and mint tones with a subtle orange cash accent. Render exact Vietnamese labels, strong alignment, and readable numbers. Avoid browser chrome, phone frame, purple, dark mode, unrelated branding, invented modules, malformed Vietnamese, clipped content, duplicated sections, and decorative illustrations.`
  },
  {
    outputPath: './wallet-concept-b.png',
    prompt: `Use case: ui-mockup. Asset type: desktop Vietnamese financial dashboard concept.
Primary request: create an asset-first Ví tiền screen for An Khang Home. Preserve the authoritative reference's real application shell, language, green palette, navigation, and information density, but make the wallet cards the visual focus. Show a strong page header Ví tiền with helper text “Tiền đang nằm ở đâu?”, three large balanced cards for Vietcombank · Sepay 15.215.732 đ, Tiền mặt tại quỹ 5.000.000 đ, and Thêm ví hoặc tài khoản, plus a right-side summary for Tổng tiền khả dụng 20.215.732 đ and Đối soát 0 đ. Include a clean bottom strip for Tài sản khác with muted zero state and a compact recent movement table. Keep Vietnamese copy crisp, business-like, and legible. Avoid browser chrome, phone frame, purple, dark mode, gradients that obscure text, unrelated branding, over-decoration, malformed text, clipped content, duplicated panels, and changing the logo or existing navigation.`
  },
  {
    outputPath: './wallet-concept-c.png',
    prompt: `Use case: ui-mockup. Asset type: desktop Vietnamese financial dashboard concept.
Primary request: create a capital-allocation focused Ví tiền screen for An Khang Home. Preserve the authoritative reference's green desktop shell, logo, top navigation, rounded card language, and compact dashboard density. Show Tổng tiền khả dụng 20.215.732 đ at the top with Khớp sổ sách and a smaller wallet balance row for Vietcombank · Sepay 15.215.732 đ and Tiền mặt tại quỹ 5.000.000 đ. Make the main lower panel a clear allocation view titled Đã phân bổ vào hũ tài chính with a segmented bar and readable rows: Vận hành, Dự phòng, Tái đầu tư, Lợi nhuận. Add a small “Biến động gần đây” ledger on the side. Use emerald, mint, cream, and restrained amber, with precise Vietnamese typography and a clear “Tái đầu tư” emphasis. Avoid browser chrome, phone frame, purple, dark mode, noisy charts, unrelated branding, malformed Vietnamese, clipped content, duplicated panels, and oversized illustrations.`
  }
]

for (const job of jobs) {
  const catalogResponse = await fetch(`${process.env.NINEROUTER_URL}/v1/models/image`)
  if (!catalogResponse.ok) throw new Error(`Model catalog failed: ${catalogResponse.status}`)
  const catalog = await catalogResponse.json()
  if (!catalog.data?.some((item) => item.id === 'cx/gpt-5.5-image')) throw new Error('cx/gpt-5.5-image is not available')
  await generateImage({ ...job, referencePaths: [reference], size: '1440x1024' })
}
