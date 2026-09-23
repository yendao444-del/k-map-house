import { generateImage } from './imagegen-utils.mjs'

await generateImage({
  outputPath: './tmp-product-design/financial-jars-concept.png',
  referencePaths: ['./tmp-product-design/wallet-demo.png'],
  size: '1440x1024',
  prompt: `Use case: ui-mockup. Asset type: desktop Vietnamese financial dashboard concept.
Primary request: transform the authoritative Ví tiền reference into a realistic “Hũ tài chính” planning screen while preserving the existing green desktop shell, top navigation, logo treatment, rounded white cards, Vietnamese language, and compact financial density. Make the main content clearly about real allocation rather than a decorative percentage demo. Keep a prominent balance header with “Tiền hiện có 20.215.732 đ”, “Ngân hàng 15.215.732 đ”, and “Tiền mặt 5.000.000 đ”. Replace the lower allocation area with a planning panel titled “Phân bổ hũ tài chính”, showing “Có thể phân bổ 8.500.000 đ” after required spending, and four clear jars: “Vận hành 3.000.000 đ”, “Trả nợ 2.000.000 đ”, “Dự phòng 2.000.000 đ”, “Tái đầu tư 1.500.000 đ”. Add a small right-side section titled “Khoản bắt buộc sắp tới” with readable rows “Điện / nước”, “Bảo trì”, “Trả nợ tháng này”, plus a concise “Còn lại để tái đầu tư” indicator. Use emerald, mint, warm cream, and restrained amber accents. Make this feel like a production-ready product screen for a Vietnamese room-rental business.
Text (verbatim): “Ví tiền”, “Tiền hiện có”, “Ngân hàng”, “Tiền mặt”, “Phân bổ hũ tài chính”, “Có thể phân bổ”, “Vận hành”, “Trả nợ”, “Dự phòng”, “Tái đầu tư”, “Khoản bắt buộc sắp tới”, “Điện / nước”, “Bảo trì”, “Trả nợ tháng này”, “Còn lại để tái đầu tư”.
Constraints: preserve the authoritative reference’s shell and hierarchy; one coherent desktop screen; exact Vietnamese labels; clear visual distinction between current cash, committed spending, and allocatable money; no code editor or browser chrome.
Avoid: purple, dark mode, arbitrary percentage-only allocation, misleading “đã phân bổ” language, fake charts, oversized illustrations, unrelated branding, malformed Vietnamese, clipped text, duplicated cards, watermarks, or invented navigation.`
})
