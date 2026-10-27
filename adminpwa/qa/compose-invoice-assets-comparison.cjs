const sharp = require('sharp')
async function main() {
  const pairs = [
    ['invoice', 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-8be7fe40-f327-40e8-816b-c1952715c144.png', 'G:/PHONG TRO/app/adminpwa/qa/invoice-export-rendered-390.png'],
    ['assets', 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-0f0018ea-905c-4f96-a57c-ce5a7ffda133.png', 'G:/PHONG TRO/app/adminpwa/qa/assets-header-390.png']
  ]
  for (const [name, first, second] of pairs) {
    const a = await sharp(first).resize({height:844}).png().toBuffer()
    const b = await sharp(second).resize({height:844}).png().toBuffer()
    const ma = await sharp(a).metadata(), mb = await sharp(b).metadata()
    await sharp({create:{width:ma.width+mb.width+24,height:844,channels:4,background:'#e5e7eb'}}).composite([{input:a,left:0,top:0},{input:b,left:ma.width+24,top:0}]).png().toFile(`G:/PHONG TRO/app/adminpwa/qa/design-qa-${name}-comparison.png`)
  }
}
main().catch(error=>{ console.error(error); process.exitCode=1 })
