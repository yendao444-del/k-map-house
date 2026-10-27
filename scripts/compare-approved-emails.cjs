const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const defs = require('./notification-demo-definitions.json')
const dir = path.resolve('docs/email-automation/approved-templates')
const crops = require('../src/shared/email-banners/manifest.json')
async function main() {
  for (let start = 0; start < defs.length; start += 4) {
    const items = defs.slice(start, start + 4)
    const tiles = []
    for (let i = 0; i < items.length; i++) {
      const id = items[i].id
      const sourcePath = path.join('webmobile/Mau thong bao', id + '.png')
      const crop = crops.find(c => c.id === id).crop
      const sourceMeta = await sharp(sourcePath).metadata()
      const source = await sharp(sourcePath).extract({left:crop.left, top:crop.top, width:crop.width, height:sourceMeta.height-crop.top}).resize({ width: 300, height: 700, fit: 'contain', position: 'top', background: 'white' }).png().toBuffer()
      const shotPath = path.join(dir, id + '-desktop.png')
      const shotMeta = await sharp(shotPath).metadata()
      const implementation = await sharp(shotPath).extract({left:Math.floor((shotMeta.width-600)/2),top:12,width:600,height:shotMeta.height-12}).resize({ width: 300, height: 700, fit: 'contain', position: 'top', background: 'white' }).png().toBuffer()
      tiles.push({ input: source, left: (i % 2) * 620, top: Math.floor(i / 2) * 710 })
      tiles.push({ input: implementation, left: (i % 2) * 620 + 310, top: Math.floor(i / 2) * 710 })
    }
    await sharp({ create: { width: 1240, height: Math.ceil(items.length / 2) * 710, channels: 3, background: '#eeeeee' } }).composite(tiles).png().toFile(path.join(dir, `comparison-${start + 1}.png`))
  }
  console.log('Source left, rendered HTML right; same visual scale in five comparison sheets.')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
