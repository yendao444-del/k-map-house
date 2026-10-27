const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  sharp = require('sharp')
const dir = path.resolve(__dirname, '../webmobile/Mau thong bao'),
  ref = path.join(dir, '_nguon/anh-mau-email-hop-dong.png'),
  defs = require('./notification-demo-definitions.json')
const source =
  'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-c87e65da-42e8-49bd-8fb2-bdedd61e50ef.png'
function prompt(d) {
  const invoice = d.invoice
    ? `Include a compact invoice table with Tiền phòng 2.400.000 đ, Tiền điện 14.000 đ, Internet 50.000 đ, Vệ sinh 70.000 đ, Tổng hóa đơn 2.534.000 đ; ${d.unpaid ? 'Đã thanh toán 0 đ; Còn phải thanh toán 2.534.000 đ.' : 'Đã thanh toán 2.534.000 đ; Còn lại 0 đ.'}`
    : ''
  return `Create ONE production-quality Vietnamese transactional email visual, not a website. 1024x1536 portrait; entire email visible, white outer margin, natural centered 600px layout, no browser chrome. AUTHORITATIVE REFERENCE: attached image is the exact user-approved AN KHANG HOME email crop. Preserve its real white logo plaque with navy/green AK + AN KHANG HOME wordmark, emerald illustrated apartment-building banner, large white headline at left, illustration at right, curved pale mint lower edge, left-aligned body, thin fact dividers, signature. Match the reference closely; do not invent a different brand. EXACT TEMPLATE: ${d.name}; audience ${d.audience}; banner headline exactly '${d.headline}'. Semantic palette: ${d.tone}; original logo colors remain navy/green. Banner illustration: ${d.illustration}. Use a refined flat editorial illustration, not 3D. Date anchor 09/10/2026 Vietnam UTC+7; all supplied facts are synthetic and exact. BODY: ${d.greeting} ${d.message} ${d.highlight ? `Emphasize '${d.highlight[0]}' as ${d.highlight[1]}.` : ''} Facts: ${d.facts.map((x) => x.join(': ')).join('; ')}. ${invoice} Closing: ${d.closing} ${d.cta ? `Add exactly one emerald button '${d.cta}' and note '${d.note}'.` : 'No button and no external link; the message must be complete in the email.'} Close with 'Trân trọng,' and 'Đội ngũ An Khang Home'. Add tiny footer 'Dữ liệu minh họa · 09/10/2026'. ${d.compact ? 'This is a compact overdue reminder with short body, only two fact rows, one balance and minimal banner detail.' : ''} AVOID: Gmail/browser UI, tabs, device frame, other brands, SPX, QR, passwords, fake phone/contact details, clutter, cards inside cards, multiple CTAs, repeated headings, tiny unreadable text, clipped footer, misspelled Vietnamese, unsupported success stamp, invented amounts, people, photorealistic luxury real estate, code or HTML annotations.`
}
function composedPrompt(d) {
  let p = prompt(d)
  if (d.instructions) p += ` TEMPLATE-SPECIFIC REQUIREMENTS: ${d.instructions}`
  if (d.tone !== 'emerald') {
    p += ` CRITICAL PALETTE OVERRIDE: preserve the reference layout and illustration style, but RECOLOR THE ENTIRE LARGE BANNER BACKGROUND to ${d.tone}. The semantic color must dominate the banner, not merely appear in a tiny icon. Only the original AK logo retains navy/green. Do not keep the emerald banner for this template.`
  }
  if (d.compact) {
    p = p.replace('1024x1536 portrait', '1024x1024 square compact email')
    p += ' CRITICAL COMPACT OVERRIDE: fit entire email in 1024x1024. Reduce the illustrated banner to roughly 240px high; use a modest 32px headline, smaller logo, simple building/document vignette at right. Body is concise, only two fact rows (or the supplied cancellation facts), balance once; minimal whitespace, no tall banner, no excessive vertical padding. All text and footer must remain comfortably readable.'
  }
  return p
}
async function main() {
  fs.mkdirSync(dir, { recursive: true })
  const all = process.argv.includes('--list')
  if (all) {
    fs.writeFileSync(path.join(dir, 'danh-muc-mau.json'), JSON.stringify(defs, null, 2) + '\n')
    console.log(defs.map((d) => d.id).join('\n'))
    return
  }
  const id = process.argv[2]
  const d = defs.find((x) => x.id === id)
  if (!d) throw Error('Run with template id, or --list')
  const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
  if (!base) throw Error('NINEROUTER_URL missing')
  const headers = {
      'Content-Type': 'application/json',
      ...(process.env.NINEROUTER_KEY
        ? { Authorization: `Bearer ${process.env.NINEROUTER_KEY}` }
        : {})
    },
    model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-5.5-image',
    p = composedPrompt(d),
    hash = crypto.createHash('sha256').update(p).digest('hex'),
    out = path.join(dir, d.id + '.png'),
    meta = path.join(dir, '_tao-anh', d.id + '.json')
  fs.mkdirSync(path.dirname(meta), { recursive: true })
  if (
    fs.existsSync(out) &&
    fs.existsSync(meta) &&
    JSON.parse(fs.readFileSync(meta)).promptHash === hash &&
    !process.argv.includes('--force')
  ) {
    const saved = JSON.parse(fs.readFileSync(meta))
    if (!saved.prompt) {
      saved.prompt = p
      fs.writeFileSync(meta, JSON.stringify(saved, null, 2) + '\n')
    }
    console.log('exists ' + out)
    return
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const cat = await fetch(base + '/v1/models/image', {
        headers,
        signal: AbortSignal.timeout(20000)
      })
      if (!cat.ok) throw Error('Catalog ' + cat.status)
      if (!(await cat.json()).data?.some((x) => x.id === model))
        throw Error('Model unavailable ' + model)
      console.log('Generating ' + d.id + ' attempt ' + attempt)
      const r = await fetch(base + '/v1/images/generations', {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(360000),
        body: JSON.stringify({
          model,
          prompt: p,
          image: `data:image/png;base64,${fs.readFileSync(ref).toString('base64')}`,
          size: d.compact ? '1024x1024' : '1024x1536',
          n: 1,
          response_format: 'b64_json'
        })
      })
      const raw = await r.text()
      if (!r.ok) throw Error('Generation ' + r.status + ' ' + raw.slice(0, 180))
      let x
      try {
        x = JSON.parse(raw)
      } catch {
        for (const line of raw.split('\n'))
          if (line.startsWith('data:'))
            try {
              const z = JSON.parse(line.slice(5))
              if (z.data?.[0]?.b64_json || z.b64_json) x = z
            } catch {}
      }
      const b = x?.data?.[0]?.b64_json || x?.b64_json
      if (!b) throw Error('No image')
      const bytes = Buffer.from(b, 'base64'),
        m = await sharp(bytes).metadata()
      fs.writeFileSync(out, bytes)
      fs.writeFileSync(
        meta,
        JSON.stringify(
          {
            id: d.id,
            name: d.name,
            model,
            prompt: p,
            promptHash: hash,
            reference: ref,
            source,
            width: m.width,
            height: m.height,
            sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
            at: new Date().toISOString()
          },
          null,
          2
        ) + '\n'
      )
      console.log('Completed ' + out)
      return
    } catch (e) {
      console.error('Attempt ' + attempt + ': ' + e.message)
      if (attempt === 3 || /401|403|unavailable/.test(e.message)) throw e
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}
main().catch((e) => {
  console.error(e.stack || e)
  process.exitCode = 1
})
