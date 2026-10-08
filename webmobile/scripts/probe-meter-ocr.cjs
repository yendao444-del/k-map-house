// Private local probe. Never writes supplied meter photos into public assets.
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const { createWorker, PSM } = require('tesseract.js')
;(async () => {
  const worker = await createWorker('eng', 1, { langPath: path.resolve(__dirname, '../../resources/identity-ocr'), gzip: false, cacheMethod: 'none' })
  try {
    const files = fs.readdirSync('C:/Users/Admin/Downloads/dien nuoc').filter(x => /\.jpg$/i.test(x))
    for (const file of files) {
      const original = path.join('C:/Users/Admin/Downloads/dien nuoc', file)
      const bytes = await sharp(original).rotate().resize({ width: 1200 }).png().toBuffer()
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, tessedit_char_whitelist: '' })
      let result = await worker.recognize(bytes, {}, { blocks: true })
      console.log(JSON.stringify({ file, mode: 'full', text: result.data.text, confidence: result.data.confidence, lines: result.data.blocks?.flatMap(b => b.paragraphs.flatMap(p => p.lines.map(l => ({ text: l.text, confidence: l.confidence, bbox: l.bbox })))) }))
      const { width, height } = await sharp(bytes).metadata()
      for (const region of [{x:.15,y:.25,w:.50,h:.13},{x:.30,y:.43,w:.40,h:.14}]) {
        const crop = await sharp(bytes).extract({left:Math.round(width*region.x),top:Math.round(height*region.y),width:Math.round(width*region.w),height:Math.round(height*region.h)}).resize({width:1600}).greyscale().normalize().sharpen().png().toBuffer()
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, tessedit_char_whitelist: '0123456789' })
        result = await worker.recognize(crop, {}, { blocks: true })
        console.log(JSON.stringify({file, mode: 'crop', region, text:result.data.text, confidence:result.data.confidence}))
      }
    }
  } finally { await worker.terminate() }
})().catch(error => { console.error(error.message); process.exit(1) })
