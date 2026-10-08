const fs = require('node:fs')
const path = require('node:path')
const reference = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-b73f4ad2-5597-4392-81dc-53f66e501c13.png'
const direction = process.argv[2]
const directions = {
  'editorial-accent': 'Editorial elegance: white email surfaces, delicate colored top rule, compact uppercase status label, excellent navy typography, balanced clear generous spacing, subtle hairline dividers. Use an elegant large amount and a compact two-column facts block. Refined, quiet, polished premium financial communication. All three states use the same design structure. Avoid large filled panels.',
  'status-band': 'Premium status banner: each email has a restrained colored header band with crisp status icon, strong heading, short supporting sentence, then a prominent amount and beautifully aligned facts. Status color is immediately distinguishable, but the majority of each email remains white. Moderate rounded corners and subtle tint only in the header. All three states use the same design structure.',
  'ledger-premium': 'Premium compact financial notice: very tight vertical hierarchy with a strong left-aligned title, status icon and a discreet outlined status badge, one emphasized amount row, horizontal dividers and compact aligned invoice facts. Extremely clean minimal ledger aesthetic, navy text and subtle colored accents, high readability. All three states use the same design structure. The overdue note should be particularly short.'
}
if (!directions[direction]) throw new Error('Unknown design direction')
const output = path.join(__dirname, direction + '.png')
const prompt = `Create a realistic premium email-template design review image, 1536 x 1024 pixels, crisp readable Vietnamese text. This is ONE cohesive design direction with THREE STATUS EXAMPLES of the same email template family, not three alternative designs. AUTHORITATIVE REFERENCE: the attached current Vietnamese Gmail testing modal screenshot from AN KHANG HOME. It establishes this exact rental-management product, Vietnamese copy, invoice money formatting, sample room and the current overly long unpaid email. PRESERVE the product identity AN KHANG HOME, Vietnamese language, navy body text, clean white email background, readable human-scale typography, room and money terminology. The outer application controls are outside the requested scope; present the EMAIL CONTENT ONLY as a clean design-review sheet with three equal columns, each showing a complete compact email, without browser/Gmail chrome or fake app navigation. Small sheet heading: MẪU EMAIL · AN KHANG HOME. Column labels: Thanh toán, Cần đối soát, Nhắc công nợ. Each column is a different STATE within the SAME visual system. Current date anchor 06/10/2026. Use sample data, Tài khoản mẫu, Phòng mẫu 101, invoice 10/2026, TEST-BANK-101.
EXACT REQUESTED CHANGES: make the emails premium and clearly color-coded. Successful payment = emerald #047857 and pale mint; unmatched SePay = deep red #b42318 and pale red; long-unpaid = amber #b45309 and pale amber. Communicate status with icon + heading + words, not color alone. Titles and amount are the immediate hierarchy. Long unpaid must be especially compact: title Lâu chưa thanh toán, greeting Xin chào Tài khoản mẫu, short sentence Phòng mẫu 101 còn khoản nợ chưa thanh toán., one single highlighted Còn phải thu 3.000.000 đ, two facts Phòng: Phòng mẫu 101 and Chưa thanh toán: 45 ngày, closing Vui lòng kiểm tra và thu hồi công nợ. No full itemized invoice table for reminders, no repeated balance or repeated greeting. Successful email title Thanh toán thành công, amount 3.000.000 đ, Phòng mẫu 101, Hóa đơn 10/2026, Mã giao dịch TEST-BANK-101, Còn phải thu 0 đ. Unmatched title Giao dịch chưa khớp, amount 1.000.000 đ, Mã giao dịch TEST-BANK-101, Trạng thái Cần đối soát, closing Vui lòng kiểm tra giao dịch trong mục Đồng bộ SePay. No paid stamp or successful-payment check on unmatched or overdue. No external links or buttons inside emails. The preview sheet should have light neutral background, ample margins and no clipped email content.
VISUAL DIRECTION: ${directions[direction]}
Avoid: clutter, nested cards, gradients, decorative backgrounds, glossy 3D, irrelevant analytics, phone bezels, browser chrome, extra control buttons, fake sent-email confirmations, checkmarks on failures, full detailed invoice table on debt reminders, duplicate totals, developer-only notes such as Chưa có luồng gửi thực tế inside email, labels that spill or truncate, tiny Vietnamese fonts, numbered options, alternative concepts inside this image. Attach and use the actual reference image.`

async function run() {
  const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
  if (!base) throw new Error('NINEROUTER_URL missing')
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NINEROUTER_KEY || ''}` }
  const model = 'cx/gpt-5.5-image'
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const catalog = await fetch(`${base}/v1/models/image`, { headers })
      if (!catalog.ok) throw new Error(`Catalog HTTP ${catalog.status}`)
      if (!(await catalog.json()).data?.some(item => item.id === model)) throw new Error('Model unavailable')
      const response = await fetch(`${base}/v1/images/generations`, {
        method: 'POST', headers, signal: AbortSignal.timeout(300000),
        body: JSON.stringify({ model, prompt, image: `data:image/png;base64,${fs.readFileSync(reference).toString('base64')}`, n: 1, size: '1536x1024', response_format: 'b64_json' })
      })
      const raw = await response.text()
      if (!response.ok) throw new Error(`Image HTTP ${response.status}`)
      let payload
      try { payload = JSON.parse(raw) } catch {
        for (const line of raw.split('\n')) if (line.startsWith('data:')) {
          try { const event = JSON.parse(line.slice(5)); if (event.data?.[0]?.b64_json || event.b64_json) payload = event } catch {}
        }
      }
      const encoded = payload?.data?.[0]?.b64_json || payload?.b64_json
      if (!encoded) throw new Error('No generated image')
      fs.writeFileSync(output, Buffer.from(encoded, 'base64'))
      fs.writeFileSync(output.replace('.png', '.json'), JSON.stringify({ model, reference, prompt, output }, null, 2))
      console.log(output)
      return
    } catch (error) {
      console.error(`Attempt ${attempt}: ${error.message}`)
      if (attempt === 3 || /401|403|unavailable/.test(error.message)) throw error
    }
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1 })
