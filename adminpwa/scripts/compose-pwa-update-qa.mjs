import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const source = `${root}/design-demos/pwa-update-required-target.png`
const implementation = `${root}/docs/design/pwa-update-qa/desktop-final.png`
const output = `${root}/docs/design/pwa-update-qa`
const images = [source, implementation]
const { width, height } = await sharp(source).metadata()
await sharp({ create: { width: width * 2, height, channels: 3, background: 'white' } })
  .composite(await Promise.all(images.map(async (input, i) => ({ input: await sharp(input).resize(width, height).png().toBuffer(), left: i * width, top: 0 }))))
  .png().toFile(`${output}/desktop-comparison.png`)
for (const [name, region] of Object.entries({
  trigger: { left: 1030, top: 0, width: 520, height: 84 },
  lock: { left: 550, top: 380, width: 490, height: 280 }
})) {
  await sharp({ create: { width: region.width * 2, height: region.height, channels: 3, background: 'white' } })
    .composite(await Promise.all(images.map(async (input, i) => ({ input: await sharp(input).extract(region).png().toBuffer(), left: i * region.width, top: 0 }))))
    .png().toFile(`${output}/${name}-comparison.png`)
}
console.log('PWA update comparison evidence saved.')
