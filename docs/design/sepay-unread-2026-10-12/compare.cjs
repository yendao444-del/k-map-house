const path = require('node:path')
const { createRequire } = require('node:module')
const requirePwa = createRequire(path.resolve(__dirname, '../../../adminpwa/package.json'))
const sharp = requirePwa('sharp')

async function main() {
  const source = await sharp(path.join(__dirname, 'groups.png')).resize(938, 850, { fit: 'fill' }).png().toBuffer()
  const implementation = await sharp(path.join(__dirname, 'implementation-desktop.png')).png().toBuffer()
  await sharp({ create: { width: 1876, height: 850, channels: 3, background: '#ffffff' } })
    .composite([{ input: source, left: 0, top: 0 }, { input: implementation, left: 938, top: 0 }])
    .png().toFile(path.join(__dirname, 'comparison-full.png'))
  const sourceRegion = await sharp(source).extract({ left: 130, top: 335, width: 676, height: 448 }).png().toBuffer()
  const actualRegion = await sharp(implementation).extract({ left: 129, top: 325, width: 676, height: 448 }).png().toBuffer()
  await sharp({ create: { width: 1352, height: 448, channels: 3, background: '#ffffff' } })
    .composite([{ input: sourceRegion, left: 0, top: 0 }, { input: actualRegion, left: 676, top: 0 }])
    .png().toFile(path.join(__dirname, 'comparison-groups.png'))
}
main().catch(error => { console.error(error); process.exit(1) })
