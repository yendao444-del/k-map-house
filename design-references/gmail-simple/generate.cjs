const fs = require('node:fs')
const path = require('node:path')
const reference = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-d512fb74-9bcd-43cf-8dd2-0d1c920442f9.png'
const output = path.join(__dirname, 'gmail-simple-demo.png')
const prompt = `Create a faithful revised screenshot at 728 x 894 pixels of the Vietnamese AN KHANG HOME Gmail modal. AUTHORITATIVE REFERENCE: the attached current product screenshot. PRESERVE: modal shape, navy text, emerald buttons, pale backgrounds, typography, spacing, all existing Gmail account settings labels and checkboxes, background application, layout hierarchy. This is a minimal correction, not a redesign. EXACT REQUESTED CHANGE: keep only the two existing action buttons in their original position below Chọn phòng cần nhắc: the solid primary button should say Gửi Gmail, the outlined secondary button should say Kiểm thử. Remove the entire separate Kiểm thử từng loại thông báo section below settings; put only the original Lịch sử gửi gần đây with Chưa có lượt gửi nào there. Keep the existing room chooser, 0 phòng empty state, and account Gmail settings. Replace explanatory paragraph under the two buttons by Kiểm thử dùng dữ liệu mẫu, không thay đổi công nợ. Current date 05/10/2026. Do not add new tabs or separate control panels. The test button will open the same interface in test mode; do not illustrate that second screen here. AVOID: adding more send buttons, extra testing section, new colors, icons, nested cards, decoration, changing font, clipped text, tiny unreadable Vietnamese, collage, numbered options, fake analytics, different layout. Generate one image of the corrected existing modal.`
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
        body: JSON.stringify({ model, prompt, image: `data:image/png;base64,${fs.readFileSync(reference).toString('base64')}`, n: 1, size: '1024x1536', response_format: 'b64_json' })
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
    } catch (error) { if (attempt === 3 || /401|403|unavailable/.test(error.message)) throw error }
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1 })
