import fs from 'node:fs/promises'
import { generateImage } from './imagegen-utils.mjs'

const [outputPath, promptPath] = process.argv.slice(2)
if (!outputPath || !promptPath) throw new Error('Usage: node generate-debt-option.mjs <output> <prompt>')

const refPaths = [
  'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-170bb36e-3eaa-4134-b9ed-ecbe593c9bd1.png',
  'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-6b7afce3-baf6-4941-99e1-969d7dc315a1.png'
]
const prompt = await fs.readFile(promptPath, 'utf8')
await generateImage({ outputPath, prompt, referencePaths: refPaths })
