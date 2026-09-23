import { generateImage } from './imagegen-utils.mjs'

const direction = process.argv[2]
const jobs = {
  glass: {
    outputPath: './tmp-product-design/visual-jars-glass-sol.png',
    prompt: `Use case: ui-mockup. Asset type: desktop Vietnamese financial dashboard with elegant physical jar visualization.
Primary request: use the attached wallet screen as the authoritative reference. Preserve its green desktop app shell, logo, top navigation, typography, white surfaces, and professional room-rental business character. Redesign the Hũ tài chính area around five beautiful translucent glass jars placed in one clean horizontal collection, not generic cards. Each jar is a polished product-style UI illustration with a subtle glass rim, soft emerald shadow, and a colored liquid/fill level representing its current balance. Label the jars clearly below or on the glass: “Sinh hoạt 5.000.000 đ”, “Trả nợ 2.000.000 đ”, “Bảo trì 1.200.000 đ”, “Dự phòng 2.000.000 đ”, “Tái đầu tư 1.500.000 đ”. Use distinct restrained colors: emerald, coral, amber, mint, and warm gold. Show “Tiền hiện có 20.215.732 đ” above and one primary action “+ Phân bổ vào hũ”. Include a compact recent allocation strip below the jars. The jars must feel premium, clean, slightly dimensional, and usable as clickable financial containers.
Text (verbatim): “Ví tiền”, “Hũ tài chính”, “Tiền hiện có”, “Sinh hoạt”, “Trả nợ”, “Bảo trì”, “Dự phòng”, “Tái đầu tư”, “Phân bổ vào hũ”, “Phân bổ nội bộ — không phải chi phí”.
Current date: 22/09/2026. Target dimensions: 1440 x 1024 desktop.
Avoid: mason-jar photo collage, childish piggy banks, cartoon faces, purple, dark mode, generic rectangular cards replacing the jars, illegible labels, malformed Vietnamese, clipped text, glass glare obscuring numbers, browser chrome, watermarks.`
  },
  shelf: {
    outputPath: './tmp-product-design/visual-jars-shelf-sol.png',
    prompt: `Use case: ui-mockup. Asset type: desktop Vietnamese financial dashboard with a premium savings-jar shelf.
Primary request: use the attached wallet screen as the authoritative product reference and preserve its green shell, navigation, logo, typography, spacing rhythm, and businesslike visual language. Create a refined “Kệ hũ tài chính” as the hero experience: five large jar-shaped containers sitting on a subtle light wooden or cream shelf inside the UI. The jars should be sophisticated semi-flat illustrations with glass bodies and simple finance icons on their labels. Show “Sinh hoạt 5.000.000 đ”, “Trả nợ 2.000.000 đ”, “Bảo trì 1.200.000 đ”, “Dự phòng 2.000.000 đ”, “Tái đầu tư 1.500.000 đ”. Each jar has a visible fill level and enough space for readable Vietnamese. Above the shelf show “Tiền hiện có 20.215.732 đ”, “Ngân hàng 15.215.732 đ”, “Tiền mặt 5.000.000 đ”, and the main action “Phân bổ tiền”. Below, add only a short helper: “Tiền trong hũ vẫn thuộc tổng tiền hiện có”. Make the visual inviting and memorable while remaining suitable for a serious property-management desktop app.
Text (verbatim): “Ví tiền”, “Kệ hũ tài chính”, “Tiền hiện có”, “Ngân hàng”, “Tiền mặt”, “Sinh hoạt”, “Trả nợ”, “Bảo trì”, “Dự phòng”, “Tái đầu tư”, “Phân bổ tiền”, “Tiền trong hũ vẫn thuộc tổng tiền hiện có”.
Current date: 22/09/2026. Target dimensions: 1440 x 1024 desktop.
Avoid: photoreal kitchen scene, childish style, cluttered décor, purple, dark mode, excessive gradients, generic cards instead of jars, unreadable text, malformed Vietnamese, clipped content, unrelated branding, browser chrome, watermarks.`
  },
  focus: {
    outputPath: './tmp-product-design/visual-jars-focus-sol.png',
    prompt: `Use case: ui-mockup. Asset type: desktop Vietnamese financial dashboard with interactive jar focus view.
Primary request: preserve the attached wallet screen as the authoritative reference: same green desktop shell, logo, navigation, white background, and compact professional typography. Build a jar-focused financial allocation screen with one large selected glass jar in the center-left, currently “Hũ Sinh hoạt” with “5.000.000 đ”, a strong visible fill level, a clean household icon, and two actions “Phân bổ thêm” and “Rút khỏi hũ”. Arrange four smaller beautiful jar thumbnails nearby for “Trả nợ”, “Bảo trì”, “Dự phòng”, and “Tái đầu tư”, each with balance labels. On the right, show a restrained “Lịch sử hũ Sinh hoạt” list with internal transfers. The top summary says “Tiền hiện có 20.215.732 đ”. Make the glass jar illustration premium, tactile, and elegant, using emerald/mint with restrained coral and amber accents. It must look like a real production UI concept, not a game.
Text (verbatim): “Ví tiền”, “Tiền hiện có”, “Hũ Sinh hoạt”, “5.000.000 đ”, “Phân bổ thêm”, “Rút khỏi hũ”, “Trả nợ”, “Bảo trì”, “Dự phòng”, “Tái đầu tư”, “Lịch sử hũ Sinh hoạt”, “Chuyển nội bộ — không ghi nhận chi phí”.
Current date: 22/09/2026. Target dimensions: 1440 x 1024 desktop.
Avoid: cartoon game UI, piggy banks, coin explosions, purple, dark mode, generic cards replacing jar shapes, glossy glare over text, malformed Vietnamese, clipped text, noisy analytics, browser chrome, watermarks.`
  }
}

if (!jobs[direction]) throw new Error(`Unknown direction: ${direction}`)
await generateImage({
  outputPath: jobs[direction].outputPath,
  referencePaths: ['./tmp-product-design/wallet-demo.png'],
  size: '1440x1024',
  prompt: jobs[direction].prompt
})
