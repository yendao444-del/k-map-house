const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const crypto = require('node:crypto')
const defs = require('./notification-demo-definitions.json')
const root = path.resolve('webmobile/Mau thong bao')
const out = path.resolve('src/shared/email-banners')
async function main() {
  fs.mkdirSync(out, { recursive: true })
  const assets = {}, manifest = []
  for (const d of defs) {
    const file = path.join(root, d.id + '.png')
    const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const colorful = (x, y, threshold = 18) => {
      const p = (y * info.width + x) * info.channels
      return Math.max(data[p], data[p + 1], data[p + 2]) - Math.min(data[p], data[p + 1], data[p + 2]) > threshold
    }
    let top = 0
    for (; top < info.height / 2; top++) {
      let count = 0
      for (let x = 0; x < info.width; x++) if (colorful(x, top)) count++
      if (count / info.width > 0.35) break
    }
    let left = 0, right = info.width - 1
    const solidRow = top + 15
    while (!colorful(left, solidRow) && left < info.width / 2) left++
    while (!colorful(right, solidRow) && right > info.width / 2) right--
    let bottom = top, empty = 0
    for (let y = top; y < info.height * 0.7; y++) {
      let count = 0
      for (let x = left; x <= right; x++) if (colorful(x, y, 10)) count++
      if (count / (right - left + 1) < 0.005) empty++; else { bottom = y; empty = 0 }
      if (empty >= 4 && y > top + 100) break
    }
    const crop = { left, top, width: right - left + 1, height: bottom - top + 3 }
    // This demo has very little whitespace before its colored greeting text.
    if (d.id === '09-hoa-don-va-dich-vu') crop.height = 486
    const bytes = await sharp(file).extract(crop).resize({ width: 600 }).png({ palette: true, colours: 256 }).toBuffer()
    fs.writeFileSync(path.join(out, d.id + '.png'), bytes)
    assets[d.id] = { cid: `${d.id}@ankhanghome`, base64: bytes.toString('base64'), alt: `An Khang Home — ${d.headline}` }
    manifest.push({ id: d.id, source: file, crop, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length })
  }
  fs.writeFileSync('src/shared/approved-email-banners.ts', '// Generated from approved email demos by scripts/package-approved-email-banners.cjs.\nexport const approvedEmailBanners = ' + JSON.stringify(assets, null, 2) + ' as const\nexport type EmailTemplateId = keyof typeof approvedEmailBanners\n')
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  const cards = await Promise.all(defs.map(async (d, i) => ({ input: await sharp(path.join(out, d.id + '.png')).resize({ width: 280, height: 190, fit: 'contain', background: 'white' }).toBuffer(), left: (i % 3) * 290, top: Math.floor(i / 3) * 200 })))
  await sharp({ create: { width: 870, height: Math.ceil(defs.length / 3) * 200, channels: 3, background: 'white' } }).composite(cards).png().toFile(path.join(out, 'banner-contact-sheet.png'))
  console.log(JSON.stringify(manifest.map(({id,crop,bytes})=>({id,crop,bytes})),null,2))
}
main().catch(e=>{console.error(e);process.exitCode=1})
