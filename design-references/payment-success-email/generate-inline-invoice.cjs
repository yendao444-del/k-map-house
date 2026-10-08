const fs = require('node:fs')
const path = require('node:path')
const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
const key = process.env.NINEROUTER_KEY || ''
const model = 'cx/gpt-5.5-image'
const reference = path.join(__dirname, 'payment-success-email-demo.png')
const direction = process.argv[2] || 'compact'
const output = path.join(__dirname, 'payment-success-email-inline-invoice.png')
const metadata = output.replace(/\.png$/, '.json')
const prompt = `Create one realistic, production-quality desktop UI screenshot at exactly 1319 x 881 pixels for the Vietnamese AN KHANG HOME rental-management product. AUTHORITATIVE REFERENCE: the attached screenshot is the current Gmail message view showing a test email titled “[KIỂM THỬ] [AN KHANG HOME] Đã ghi nhận thanh toán SePay · Phòng mẫu 101”. Preserve the Gmail desktop chrome, left mailbox navigation, pale gray background, white message surface, layout proportions, Vietnamese language, and the existing AN KHANG HOME visual identity. Do not redesign Gmail or add an app dashboard.

EXACT REQUESTED CHANGE: redesign only the email body for a real successful-payment notification. The message subject should read “[AN KHANG HOME] Thanh toán đã ghi nhận · Phòng 101”. In the message body, create a calm, polished receipt-like hierarchy: a compact emerald success banner with a check icon and “Thanh toán thành công”; greeting “Xin chào Đào Bình Yên,”; a prominent amount “3.000.000 đ”; a clear summary grid or rows for “Phòng 101”, “Hóa đơn tháng 10/2026”, “Mã giao dịch TEST-BANK-101”, “Kênh Sepay”; a green-highlighted line “Còn phải thu 0 đ”; a small next-step line telling the user the payment was matched to the invoice; and a restrained emerald outline button “Xem hóa đơn”. Keep the content centered in the message column, readable, spacious, and scannable. Make Vietnamese accents and number formatting correct. Use the provided screenshot as the exact visual frame reference.

Avoid: changing Gmail chrome or navigation, dark mode, purple gradients, excessive cards, fake logos, unrelated metrics, extra navigation, sidebars, annotation arrows, text outside the email UI, clipped content, tiny unreadable type, raw HTML tags, placeholder lorem ipsum, and any financial claim besides the single 3.000.000 đ payment shown.`
const directions = {
  compact: '',
  branded: '\nDIRECTION: Brand-led warm confirmation. Redesign the body as one email-safe 600px receipt surface. Put a restrained AN KHANG HOME wordmark in emerald at the top, a soft mint successful-payment hero with one checkmark and centered title, then a very large centered 3.000.000 đ amount. Below it use an elegant two-column label/value receipt with light separators and a full-width dark emerald remaining-balance strip reading Còn phải thu 0 đ. All details stay complete. One small outlined Xem hóa đơn button at the bottom. Visibly different hierarchy from a compact summary grid. No illustration, no decorative photography, no gradients. Preserve the Gmail chrome. Show the content as the real non-test notification; omit KIỂM THỬ banners and fake transactional claims.',
  ledger: '\nDIRECTION: Precise premium receipt. A flat ivory-white letter layout aligned left, small AN KHANG HOME wordmark and thin dark emerald top rule, checkmark beside Thanh toán thành công, a concise explanatory paragraph, then an elegant ruled transaction table. Show 3.000.000 đ large but left-aligned beside a small green Đã thanh toán badge. In clear rows show Phòng 101, Hóa đơn tháng 10/2026, Mã giao dịch TEST-BANK-101, Kênh SePay, and Còn phải thu 0 đ. End with subtle Thank-you copy and one understated Xem hóa đơn link/button. No large hero banner, no nested cards, no shadows, no gradients. Deliberately formal and print-like while retaining navy text and emerald identity. Preserve Gmail chrome. Show the real non-test notification and omit KIỂM THỬ banners.'
}
const finalPrompt = `Create one revised production-quality email design. AUTHORITATIVE REFERENCE is the attached generated image that the user explicitly selected as Phương án 1. We attach this previously generated image because it is the approved design source of truth. Preserve its Gmail frame, colors, 600px centered white email body, green success strip, bold amount, table of payment details and remaining-balance strip. EXACT REQUESTED CHANGE: remove the Xem hóa đơn external-link button entirely and replace it with an inline Chi tiết hóa đơn section immediately below the confirmation paragraph. This section is inside the SAME email, not a new page. Do not include any external CTA. Show clear two-column receipt rows: Tiền phòng 2.500.000 đ; Tiền điện 250.000 đ; Tiền nước 100.000 đ; Internet 100.000 đ; Vệ sinh 50.000 đ; Tổng hóa đơn 3.000.000 đ; Đã thanh toán 3.000.000 đ; Còn phải thu 0 đ. Keep the top payment amount 3.000.000 đ, Phòng 101, Hóa đơn tháng 10/2026, TEST-BANK-101, Kênh SePay and recipient Đào Bình Yên. Current date anchor 05/10/2026. Use a taller desktop-email frame 1536 x 1280 pixels if necessary so the full email is visible without clipping. Use readable Arial-like Vietnamese text, clean row separators, accurate accents and sums. Avoid changing the chosen direction, cropping body content, adding cards inside cards, fake logos, unrelated fields, gradients, external links, buttons, sample/test banners or a collage. Produce exactly one revised design image.`
if (!base) throw new Error('NINEROUTER_URL is missing')
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }
async function run() {
  const image = `data:image/png;base64,${fs.readFileSync(reference).toString('base64')}`
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const catalogResponse = await fetch(`${base}/v1/models/image`, { headers })
      if (!catalogResponse.ok) throw new Error(`Model catalog HTTP ${catalogResponse.status}`)
      const catalog = await catalogResponse.json()
      if (!catalog.data?.some((entry) => entry.id === model)) throw new Error(`Model ${model} is unavailable`)
      const response = await fetch(`${base}/v1/images/generations`, { method: 'POST', headers, body: JSON.stringify({ model, prompt: finalPrompt, image, n: 1, size: '1536x1280', response_format: 'b64_json' }), signal: AbortSignal.timeout(300000) })
      const raw = await response.text()
      if (!response.ok) throw new Error(`Generation HTTP ${response.status}: ${raw.slice(0, 300)}`)
      let payload
      try { payload = JSON.parse(raw) } catch {
        for (const line of raw.split('\n')) if (line.startsWith('data:')) { try { const event = JSON.parse(line.slice(5)); if (event.data?.[0]?.b64_json || event.b64_json) payload = event } catch {} }
      }
      const encoded = payload?.data?.[0]?.b64_json || payload?.b64_json
      if (!encoded) throw new Error(`No image bytes: ${raw.slice(0, 200)}`)
      fs.writeFileSync(output, Buffer.from(encoded, 'base64'))
      fs.writeFileSync(metadata, JSON.stringify({ model, reference, prompt: finalPrompt, output }, null, 2))
      process.stdout.write(output)
      return
    } catch (error) {
      if (attempt === 3 || /401|403|unavailable/.test(error.message)) throw error
    }
  }
}
run().catch((error) => { console.error(error.message); process.exitCode = 1 })
