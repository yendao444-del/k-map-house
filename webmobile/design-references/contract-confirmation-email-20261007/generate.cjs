const fs = require('node:fs')
const path = require('node:path')
const references = [
  'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-b1befe15-19ec-4775-acae-5088012a50e7.png',
  'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-a9e2790c-20ec-4818-b01d-da670fbd427c.png'
]
const directions = {
  'emerald-illustration': 'A welcoming illustrated banner. Full-width emerald header with small white AN KHANG HOME wordmark at upper left. Large clean white heading XÁC NHẬN HỢP ĐỒNG on the left; elegant flat illustration of a cream apartment building, key and rental agreement on the right, restrained mint shapes. A subtle curved lower edge connects banner to the white content. Body left-aligned, facts in two simple rows with a divider, generous spacing, green button below. Friendly residential service, polished and professional; no people needed.',
  'mint-editorial': 'A restrained editorial banner. Thin emerald brand strip, white AN KHANG HOME wordmark row, then a pale mint hero with a large deep green left-aligned heading Xác nhận hợp đồng thuê phòng and an elegant paper document with a key illustration at right. Much less saturated than the other directions. Body is compact and airy on plain white, one simple pale mint summary band with two side-by-side facts Phòng 999 and Ngày bắt đầu 07/10/2026. Green CTA is clearly dominant. Premium service email, crisp typography and subtle separators, no nested boxes.',
  'home-photo': 'An understated hospitality banner with a photorealistic bright modern small rental studio as the upper hero image: tidy bed, warm wood, daylight, green plant. A clean dark forest-green brand bar above the photograph carries AN KHANG HOME. Keep the photograph unobstructed, with a single short white title Xác nhận hợp đồng on an unobtrusive forest-green solid area along its lower left. Below it, white content with an editorial large room 999 heading and compact inline start date, clean left-aligned greeting, paragraph, and primary green CTA. Feels trustworthy like a professional property operator, never a luxury villa or a real-estate advertisement.'
}
const direction = process.argv[2]
if (!directions[direction]) throw new Error('Unknown direction')
const output = path.join(__dirname, `${direction}.png`)
const prompt = `Create ONE realistic, production-quality Vietnamese transactional EMAIL design demo, not a website or dashboard. Target dimensions: 1024 x 1536 pixels, portrait canvas. Present only the complete email content at comfortable readable scale, with small neutral outer margins, no browser or Gmail interface. The email content is a natural approximately 600px-wide email layout enlarged proportionally for the image. Do not stretch or crop any part. Include every section and closing inside the canvas.
AUTHORITATIVE REFERENCE: attached image A is the existing AN KHANG HOME contract-confirmation email in Gmail. Preserve its actual brand, purpose, greeting to Khách thuê thử nghiệm, room 999, link validity 72 hours, and one clear contract-review CTA. Ignore the account-switcher popup and Gmail/browser chrome: those are outside the email redesign. SECONDARY REFERENCE: attached image B is the SPX email supplied by the user. It is used ONLY to ground the requested composition of a professional branded image banner above readable live-text content. It belongs to another brand intentionally supplied by the user; do NOT copy SPX identity, orange palette, truck, parcel, app-store download blocks or returns content.
EXACT REQUESTED CHANGE: turn the very plain text email in reference A into a polished AN KHANG HOME branded email with an image banner at the top and clean, concise text below, as in the composition of reference B. Use existing Electron brand colors: primary #00ab60, forest green #064a31, pale mint #edf9f1, ink #15231d, white surfaces. Elegant readable sans serif typography, refined spacing and restraint. Do not stack multiple cards. The banner is the only substantial illustration/photo region; the message below looks like actual text, never text over a busy image.
CURRENT DATE ANCHOR: 07/10/2026, UTC+7. Demo dates use this anchor. Realistic mock facts: Phòng 999; Ngày bắt đầu 07/10/2026. Do not add a price, payment request, QR code, account password, identity data or a signed contract status. This email asks the tenant to REVIEW AND CONFIRM an unsigned contract.
CONTENT BELOW BANNER: greeting Xin chào Khách thuê thử nghiệm,; concise sentence Hợp đồng thuê phòng 999 đã sẵn sàng để bạn xem và xác nhận.; the two room/date facts; concise instruction Vui lòng kiểm tra thông tin cá nhân và điều khoản trước khi xác nhận.; ONE primary emerald button labeled Xem và xác nhận hợp đồng; a small readable note Link có hiệu lực 72 giờ và chỉ sử dụng một lần.; divider and restrained closing Trân trọng, / Đội ngũ An Khang Home; tiny readable security note Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email và liên hệ chủ nhà. No fabricated phone or support email. Preserve Vietnamese diacritics exactly; no clipped or crowded labels. Show the full email at once. Brand is AN KHANG HOME, optionally simple AK monogram, never an invented competing brand.
VISUAL DIRECTION: ${directions[direction]}
AVOID: multiple design options in this image, numeric option labels, Gmail or browser chrome, account-switcher popup, orange SPX branding, generic dashboard, navigation tabs, nested cards, large decorative shadows, glossy 3D cartoon characters, tiny dense text, repeated headings/greetings, extra actions or marketing links, attachment claims, passwords, payment details, QR codes, accepted/signed stamps, invented contact details, code/developer notes, lorem ipsum, stretched photos, cropped footers, unreadable Vietnamese. This is an image mockup only, no implementation.`

async function main() {
  const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
  if (!base) throw new Error('NINEROUTER_URL missing')
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NINEROUTER_KEY || ''}` }
  const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-image-2.5'
  const images = references.map(file => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const catalog = await fetch(`${base}/v1/models/image`, {headers,signal:AbortSignal.timeout(20000)})
      if (!catalog.ok) throw new Error(`Catalog HTTP ${catalog.status}`)
      if (!(await catalog.json()).data?.some(item => item.id === model)) throw new Error('Requested model unavailable')
      const response = await fetch(`${base}/v1/images/generations`, {method:'POST',headers,signal:AbortSignal.timeout(300000),body:JSON.stringify({model,prompt,images,n:1,size:'1024x1536',response_format:'b64_json'})})
      const raw = await response.text()
      if (!response.ok) throw new Error(`Generation HTTP ${response.status}: ${raw.slice(0,180)}`)
      let payload
      try { payload = JSON.parse(raw) } catch {
        for (const line of raw.split('\n')) if (line.startsWith('data:')) {
          try { const event = JSON.parse(line.slice(5)); if (event.data?.[0]?.b64_json || event.b64_json) payload = event } catch {}
        }
      }
      const encoded = payload?.data?.[0]?.b64_json || payload?.b64_json
      if (!encoded) throw new Error('No image in provider response')
      fs.writeFileSync(output,Buffer.from(encoded,'base64'))
      fs.writeFileSync(output.replace('.png','.json'),JSON.stringify({direction,model,references,prompt,output},null,2))
      console.log(output)
      return
    } catch (error) {
      console.error(`Attempt ${attempt}: ${error.message}`)
      if (attempt === 3 || /401|403|unavailable/.test(error.message)) throw error
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode=1 })
