import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
const root = new URL('./', import.meta.url)
const path = name => fileURLToPath(new URL(name,root))
const reference = await sharp(path('demo.png')).extract({left:33,top:11,width:1534,height:967}).resize(1020,650).toBuffer()
const implementation = await sharp(path('implemented-desktop.jpg')).extract({left:283,top:171,width:1020,height:650}).toBuffer()
await sharp({create:{width:2064,height:650,channels:3,background:'#e2e8f0'}}).composite([{input:reference,left:0,top:0},{input:implementation,left:1044,top:0}]).png().toFile(path('comparison.png'))
await sharp({create:{width:2064,height:380,channels:3,background:'#e2e8f0'}}).composite([{input:await sharp(reference).extract({left:0,top:260,width:1020,height:380}).toBuffer(),left:0,top:0},{input:await sharp(implementation).extract({left:0,top:260,width:1020,height:380}).toBuffer(),left:1044,top:0}]).png().toFile(path('comparison-methods.png'))
