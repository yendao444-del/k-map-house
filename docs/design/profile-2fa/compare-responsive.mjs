import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
const path=name=>fileURLToPath(new URL(name,import.meta.url))
const original='C:/Users/Admin/AppData/Local/Temp/codex-clipboard-db378bcf-66de-4314-9f55-baae0697932f.png'
const reference=await sharp(original).resize(1058,706).toBuffer()
const implementation=await sharp(path('./responsive-password-desktop.jpg')).toBuffer()
await sharp({create:{width:2136,height:706,channels:3,background:'#dfe6ee'}}).composite([{input:reference,left:0,top:0},{input:implementation,left:1078,top:0}]).png().toFile(path('./responsive-comparison.png'))
