import { generateImage } from './imagegen-utils.mjs'

const jobs = {
  emerald: {
    outputPath: './src/renderer/src/assets/financial-jar-emerald.png',
    prompt: `Use case: ui-mockup asset. Asset type: reusable raster UI illustration.
Create one premium transparent-looking glass savings jar asset for a Vietnamese financial dashboard. Match the attached selected design's jar language: rounded glass jar with wide shoulders, clear rim, soft highlight, subtle shadow, and a visible emerald-green liquid fill in the lower half. No text, no labels, no icons, no coins, no background scene. Center the jar with generous padding on a clean white background so it can be placed behind HTML labels in a desktop app. Production-quality, polished, restrained, not childish. Target dimensions: 512 x 640.
Avoid: text, numbers, logos, hands, kitchen context, photoreal clutter, purple, dark background, watermark, cropped edges.`
  },
  coral: {
    outputPath: './src/renderer/src/assets/financial-jar-coral.png',
    prompt: `Use case: ui-mockup asset. Asset type: reusable raster UI illustration.
Create one premium glass savings jar asset matching the attached selected design. Use a soft coral-red liquid fill in the lower half, clear glass body, wide rounded shoulders, polished rim, subtle shadow, and clean white background. No text, labels, icons, coins, or scene; the jar will receive HTML content beside it. Keep the silhouette and lighting consistent with a family of jars. Target dimensions: 512 x 640.
Avoid: text, numbers, logos, hands, kitchen context, photoreal clutter, purple, dark background, watermark, cropped edges.`
  },
  amber: {
    outputPath: './src/renderer/src/assets/financial-jar-amber.png',
    prompt: `Use case: ui-mockup asset. Asset type: reusable raster UI illustration.
Create one premium glass savings jar asset matching the attached selected design. Use a warm amber-gold liquid fill in the lower half, clear glass body, wide rounded shoulders, polished rim, subtle shadow, and clean white background. No text, labels, icons, coins, or scene; the jar will receive HTML content beside it. Keep the silhouette and lighting consistent with a family of jars. Target dimensions: 512 x 640.
Avoid: text, numbers, logos, hands, kitchen context, photoreal clutter, purple, dark background, watermark, cropped edges.`
  }
}

for (const job of Object.values(jobs)) {
  await generateImage({
    outputPath: job.outputPath,
    referencePaths: ['./tmp-product-design/visual-jars-glass-sol.png'],
    size: '512x640',
    prompt: job.prompt
  })
}
