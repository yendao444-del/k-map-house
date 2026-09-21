import fs from 'node:fs/promises'
import { generateImage } from './imagegen-utils.mjs'

const prompt = await fs.readFile('tmp-product-design/debt-report-history-demo.txt', 'utf8')
await generateImage({
  outputPath: 'tmp-product-design/debt-report-history-demo.png',
  prompt,
  referencePaths: ['C:/Users/Admin/AppData/Local/Temp/codex-clipboard-8af74a17-c8a0-4345-9790-91c7104bcb52.png'],
  size: '1440x1024'
})
