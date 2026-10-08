import fs from 'node:fs/promises'
import path from 'node:path'

const name = process.argv[2]
const directions = {
  'faceted-original-v4': `Keep the original orange-to-red unpaid action exactly and add subtle diagonal geometric background facets like the existing green buttons.`,
  'ruby-v3': `USER-SELECTED PRIVATE BANKING DESIGN, RED UNPAID REVISION. The supplied image is the previous emerald-v2 generated demo which the user explicitly selected as option 1; using this generated image is intentional because the user requests its exact layout with only status colors changed. Keep that chosen premium button design exactly: 198x36px, 9px corners, wallet outline at left, 'Chưa thu' center, fine vertical separator and right month compartment with small 'THÁNG' above large '10'. Recolor ALL these currently forest-green unpaid buttons to a rich muted ruby/crimson satin surface, main #a62e40 with subtle depth #842337; choose a refined medium-deep red that reads unmistakably as outstanding payment, not nearly-black brown. Maintain a fine rose edge #c76b79, subtle top highlight, warm-white text and thin warm-white wallet icon. The divider is low-opacity pale rose. Keep restrained shadow. Preserve the button's carefully spaced typography and exact hierarchy, no rearrangement. Recolor the debt mini-calendar tiles '9' and '10' to matching muted red family with white digits and a refined rose keyline, preserving their chosen shape, scale, positioning and grouping. Month 9 subdued burgundy, month 10 clearer ruby. Keep all occupancy pills green and all unrelated controls in their original colors. Red is reserved for outstanding debt and unpaid financial actions. The result should feel premium and clearly communicate money still unpaid.`,
  'emerald-v2': `PRIVATE BANKING EMERALD. A materially more luxurious 198x36px financial button, softly rounded 9px rectangle with a deep forest green satin surface (#073e32), a fine understated mint edge, and controlled 1px upper highlight. This is a composed micro-layout: on the left a 22px inset icon well with a delicate mint outlined wallet; center 'Chưa thu' in warm white, sentence case, 12px semibold; on the right a slim vertical separator and a dedicated 46px month area with tiny uppercase 'THÁNG' above larger crisp '10'. Keep icon, label and month clearly aligned on one balanced horizontal control. Very soft short shadow, not glowing. Redesign debt badges as tiny 26x26px emerald mini-calendar tiles, a narrow lighter header line at top and centered bold white '9' or '10', corner radius 6px, subtle mint keyline; month 9 slightly muted and month 10 stronger. These mini-calendar badges sit above the existing red amounts, never overlap them. This must feel like a bespoke private-banking component, not a generic pill or just a color swap.`,
  'obsidian-v2': `OBSIDIAN EDITORIAL. Financial button is an impeccably composed 198x36px near-black ink rectangular control (#20292b), 8px radius, hairline graphite edge, elegant soft shadow. Left status section uses a small fine amber hollow status ring followed by 'Chưa thu' in warm white 12px semibold. Right section is a separate integrated 60px pearl inset, with 'Tháng 10' in dark ink, 11px semibold, an ultra-fine vertical separator between the two areas and a very small right arrow within the pearl area. It reads as a single premium split-status action, not two unrelated buttons. No gradient, no glossy bevel. Debt badges '9' and '10' are 26x23px ivory ceramic tiles with ink numerals, 6px radius and crisp 1px muted grey borders; a tiny emerald 2px underline on each chip ties it to the brand. Keep the prior and current month distinguishable using a muted amber underline for 9 and emerald for 10. Precisely align the chip pair above debt amounts. Think high-end wealth-management software: typographic control, crafted inset detail, quiet density.`,
  'pearl-v2': `PEARL PRECISION. Create a 198x36px pearl-white financial control with 9px radius, carefully shaded ivory surface, fine neutral border and very soft elevation. At left a compact 22px dark forest-green inset square with a crisp white thin wallet outline; middle two levels of text, 'Chưa thu' in dark green 12px semibold and a small neutral 'Tháng 10' below at 9px. At right a compact 24px softly filled emerald circular arrow area with thin dark emerald arrow, all spaced as one balanced button. This is a high-quality information hierarchy and crafted icon arrangement, not a conventional colored badge. The debt month badges become 26x25px precise tiny square tiles with white/mint surfaces, fine emerald keyline and deep green '9' and '10' numerals at 12px semibold; along each tile's top edge a fine emerald bar gives a calendar-like visual cue. Slightly warmer ivory and subdued amber top edge for 9, pearl-mint with forest top edge for 10. Debt amount stays the original red. Show consistent alignment and polished spacing.`,
  amber: `Warm amber, quiet banking polish. Replace each unpaid orange/red gradient button with a pale ivory-amber background, thin warm amber border, 8px radius, a small dark-amber wallet outline icon inside a subtle 20px icon area, dark warm-brown semibold text 'Chưa thu', and a small deeper amber text capsule 'Tháng 10' at right. Exactly 198x30px with generous but compact horizontal spacing. Refine the month debt badges above amounts into compact 24x20px rounded-square chips with 6px radius: badge '9' in soft sage with deep emerald digits; badge '10' in soft mint-teal with deep teal digits. Subtle hairline borders, no strong shadows. Align chip pairs neatly to the right edge of the debt amounts.`,
  navy: `Deep navy finance polish. Replace each unpaid gradient button with a restrained deep slate-navy 198x30px button, 8px corner radius and an almost imperceptible top highlight. A tiny amber status dot followed by white sentence-case semibold text 'Chưa thu tháng 10', and a thin white right chevron. Keep readable text and restrained elevation. Refine debt month chips into compact 24x20px outlined pills: badge '9' soft amber with dark amber digits to identify earlier debt, badge '10' soft teal with dark teal digits. Rounded 6px corners, light borders, clear balanced numerals. Show pairs with a 4px gap above the debt amount, right aligned.`,
  coral: `Refined coral status polish. Replace each unpaid orange/red gradient button with a very pale coral 198x30px button, a subtle coral outline, 8px radius, small refined rose wallet outline icon at left, clear dark brick-red semibold sentence-case text 'Chưa thu tháng 10', and a delicate brick-red chevron at right. Subtle clean surface, no glow. Refine debt month badges into compact 24x20px softly filled solid muted teal pills with 6px radius, crisp white '9' and '10' numerals, and a tiny soft edge highlight. Shade '9' muted emerald, '10' deep teal. Keep the pair right aligned above debt amounts and retain table density.`
}
if (!directions[name]) throw new Error('Unknown direction')
const base = process.env.NINEROUTER_URL
if (!base) throw new Error('Missing NINEROUTER_URL')
const headers = { 'Content-Type': 'application/json' }
if (process.env.NINEROUTER_KEY) headers.Authorization = `Bearer ${process.env.NINEROUTER_KEY}`
const source = name === 'ruby-v3'
  ? 'design-references/room-payment-premium/emerald-v2.png'
  : 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-dc76cdff-012c-4aab-9ef4-340a8106ce73.png'
const image = 'data:image/png;base64,' + (await fs.readFile(source)).toString('base64')
const prompt = name === 'faceted-original-v4' ? `Use case: precise-object-edit, minimal desktop UI background decoration only.
The attached original An Khang Home screenshot is the SOLE AUTHORITATIVE REFERENCE and edit target. This is NOT a redesign. The user has rejected earlier redesigns and explicitly requests the ORIGINAL UI with one tiny enhancement.
Target dimensions: 1418x922, identical aspect ratio to the source desktop screenshot. Current date anchor: 5 October 2026. Preserve all source dates and data.
Preserve the entire original screenshot: navigation, brand, layout, row height, column widths, controls, all fonts and text sizes, borders, colors, icons, occupancy pills, green and teal month badges '9' and '10', monetary amounts, blue invoice actions, and all source labels. Specifically preserve the original unpaid button's exact 198x27px compact rounded rectangle, orange-left to red-right gradient, tiny white hand-holding-money icon and single-line bold uppercase white label 'CHƯA THU THÁNG 10'. DO NOT change the font, case, size, shape, label arrangement, or icon of that button.
Exact requested change: ONLY add the same diagonal polygon/faceted background treatment already visible on the green 'Phòng', 'Tất cả', 'Thêm phòng', and 'ĐANG Ở' controls to every orange/red 'CHƯA THU THÁNG 10' button. Study those source green controls and transfer their geometry and restrained translucent tonal effect to the unpaid button's existing orange/red background. Add a broad translucent light-orange parallelogram entering from top left with a diagonal edge, plus one restrained dark-red angular facet at the far right/lower corner. Use about 12-18 percent opacity relative to the original surface so the polygon shapes are visibly present but never obscure the white label. No pattern repetition. All polygons clipped neatly within the original rounded button. There must be visible diagonal geometrical shapes across the background, not merely a smooth gradient.
Keep identical faceted treatment on every visible unpaid button, matching the reference green controls in simplicity and visual language. Keep text above all polygon shapes. Output one complete product screenshot with the smallest possible edit.
Avoid: any redesign, ruby/burgundy recoloring, white/outlined button, wallet icon substitution, separate month compartment, changes to badge '9' or '10', bigger button, larger typography, sentence case, additional labels, heavy shadows, metallic textures, confetti, busy triangles, extra buttons, changes to green buttons, changes to blue buttons, changed money values, illegible Vietnamese, clipping or cropped content, mockup frame or captions.` : `Use case: ui-mockup, precise component redesign on an existing desktop product screenshot.
Create a realistic production-quality UI demo from the attached image. This attached An Khang Home room-list screenshot is the SOLE AUTHORITATIVE REFERENCE and edit target, not generic inspiration.
Target dimensions 1418x922, matching source aspect ratio and full desktop table framing. Current date anchor 5 October 2026; preserve all source dates and actual October 2026 status labels.
Preserve: the entire application navigation, logo, white and light slate surfaces, emerald brand accents, alert banner, room-list title, filtering, search, table columns, all row positions and row heights, every room name, monetary number, debt amount, lease status, tenant count, date, and existing unrelated action buttons. Preserve Vietnamese text and ensure it is sharp, readable and unclipped. Keep the source's compact table, no extra rows, panels or cards.
Exact requested change: only redesign the repeated 'CHƯA THU THÁNG 10' financial action buttons and the tiny month number badges '9' and '10' above amounts in the 'TỔNG NỢ' column. Apply the same chosen design consistently to every visible instance. Keep the data meaning and place each control in its original cell. Preserve zero-debt rows and blue 'CÓ THỂ LẬP HĐ NGAY' buttons unchanged. Do not move month badges into the financial action.
Design direction: ${directions[name]}
Typography: match existing sans-serif product font, readable compact labels, normal sentence case for updated unpaid actions, aligned tabular numerals in the month badges. Use purposeful spacing, thin clean borders and very restrained elevation. Premium means precise typography and proportions appropriate to a finance table.
Avoid: neon gradients, bright orange-to-red gradients on changed buttons, excessive shine, huge shadows, glass effects, decorative gold, oversized badges, change to green occupancy pills, change to blue invoice buttons, redesigning the screen, changing amounts, month labels like 'T9' instead of the requested '9', cropped text, clipped icons, new navigation, new features, device mockup, multiple concepts in one image, captions or annotations. Output one complete edited product screenshot.`
await fs.mkdir(path.resolve('design-references/room-payment-premium'), { recursive: true })
await fs.writeFile(path.resolve('design-references/room-payment-premium', `${name}-prompt.txt`), prompt)
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalogResponse = await fetch(`${base}/v1/models/image`, { headers })
    if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`)
    const catalog = await catalogResponse.json()
    const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-5.5-image'
    if (!catalog.data?.some(m => m.id === model)) throw new Error('Selected image model unavailable')
    console.log(`${name}: generating with ${model}, attempt ${attempt}`)
    const response = await fetch(`${base}/v1/images/generations`, {
      method: 'POST', headers, signal: AbortSignal.timeout(240000),
      body: JSON.stringify({ model, prompt, image, size: '1418x922', n: 1, response_format: 'b64_json' })
    })
    const raw = await response.text()
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}: ${raw.slice(0, 160)}`)
    let result
    try { result = JSON.parse(raw) } catch {
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6))
          if (event.data?.[0]?.b64_json || event.b64_json) result = event
        } catch {}
      }
    }
    const b64 = result?.data?.[0]?.b64_json || result?.b64_json
    if (!b64) throw new Error('Provider returned no image bytes')
    const dest = path.resolve('design-references/room-payment-premium', `${name}.png`)
    await fs.writeFile(dest, Buffer.from(b64, 'base64'))
    console.log(dest)
    break
  } catch (error) {
    console.error(`${name} attempt ${attempt}: ${error.message}`)
    if (attempt === 3) process.exitCode = 1
  }
}
