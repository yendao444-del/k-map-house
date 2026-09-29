import fs from 'node:fs/promises'
import path from 'node:path'
const name = process.argv[2]
const concepts = {
  presets: 'Quick presets inline. Between amount and reason add a compact time section: THỜI GIAN GIAO DỊCH, buttons Bây giờ (selected emerald), Hôm nay, Hôm qua, Chọn ngày. Below show 28/09/2026 at 14:30 and a small clickable Đổi giờ control. One click chooses common dates; no always-visible calendar. Keep this shortest and most compact. Add subtle helper text: Mặc định là thời điểm lưu giao dịch.',
  calendar: 'Calendar popover. Between amount and reason add one compact row THỜI GIAN GIAO DỊCH with clickable 28/09/2026 and 14:30. Show the date picker opened as a tasteful anchored popover, with Bây giờ and Hôm qua shortcuts, month Tháng 9, 2026, previous/next arrows, Monday-first calendar. September 1 2026 is Tuesday, 28 is Monday and selected. Show all 30 days correctly. Use a compact popover that does not hide the modal save action; increase canvas height naturally if necessary. Date picked with a mouse and time has hour/minute increment arrows.',
  strip: 'Recent-day strip. Between amount and reason insert THỜI GIAN GIAO DỊCH, then 5 compact day buttons: T5 24, T6 25, T7 26, CN 27, T2 28 (selected, Hôm nay), plus a calendar icon labeled Ngày khác. These are September 2026 dates. Under the strip show Giờ giao dịch: 14 : 30, with obvious tiny up/down arrow buttons above/below each numeric segment for mouse-only hour and minute stepping, and a Bây giờ reset button. Keep clean and compact with no expanded calendar.'
}
if (!concepts[name]) throw new Error('Unknown direction')
const base = process.env.NINEROUTER_URL
if (!base) throw new Error('Missing NINEROUTER_URL')
const headers = { 'Content-Type': 'application/json' }
if (process.env.NINEROUTER_KEY) headers.Authorization = `Bearer ${process.env.NINEROUTER_KEY}`
const image = 'data:image/png;base64,' + (await fs.readFile('C:/Users/Admin/AppData/Local/Temp/codex-clipboard-2664d95a-9b4c-46a9-a09b-4a60c96f92dc.png')).toString('base64')
const prompt = `Create a realistic production-quality UI mockup. The attached screenshot is the sole authoritative product reference: Vietnamese An Khang Home debt transaction modal. Preserve white rounded modal, slate/navy typography, emerald accent, blurred grey background, existing three transaction tabs, amount input with quick-money buttons, reason dropdown, Cancel and Save footer. Preserve Vietnamese labels, clear readable hierarchy and spacing. Exact change: add the easiest mouse-first date/time control to this existing modal. Current date anchor Monday 28 September 2026, demo local time 14:30. Target dimensions 808x900, natural taller modal to accommodate new section; never stretch source, never crop footer. One focused modal only, one design, no presentation captions. Direction: ${concepts[name]} Avoid: changing other modules, adding decrease-debt controls, redesigning branding, purple, mobile device frames, multiple concepts in one image, unreadable Vietnamese, clipped content, excessive cards, keyboard-required entry. Use restrained borders and shadows matching reference. Show the full modal.`
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const catalog = await fetch(`${base}/v1/models/image`, { headers }).then(r => r.json())
    const model = 'cx/gpt-5.5-image'
    if (!catalog.data?.some(m => m.id === model)) throw new Error('Required image model unavailable')
    const res = await fetch(`${base}/v1/images/generations`, {
      method: 'POST', headers, signal: AbortSignal.timeout(240000),
      body: JSON.stringify({ model, prompt, image, size: '808x900', n: 1, response_format: 'b64_json' })
    })
    const raw = await res.text()
    if (!res.ok) throw new Error(`Provider HTTP ${res.status}: ${raw.slice(0, 200)}`)
    let data
    try { data = JSON.parse(raw) } catch {
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ')) continue
        try { const event = JSON.parse(line.slice(6)); if (event.data?.[0]?.b64_json || event.b64_json) data = event } catch {}
      }
    }
    const b64 = data?.data?.[0]?.b64_json || data?.b64_json
    if (!b64) throw new Error('Provider returned no image bytes')
    const dest = path.resolve('design-references/debt-time', `${name}.png`)
    await fs.writeFile(dest, Buffer.from(b64, 'base64'))
    console.log(dest)
    break
  } catch (error) {
    console.error(`${name} attempt ${attempt}: ${error.message}`)
    if (attempt === 3) process.exitCode = 1
  }
}
