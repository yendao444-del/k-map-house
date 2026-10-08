const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const source = path.join(__dirname, '..', 'emerald-illustration.png')
const output = path.join(__dirname, '..', 'banner-art.png')
const prompt = `Create one standalone raster email banner, final target 1200x660 pixels, wide landscape ratio 20:11. AUTHORITATIVE REFERENCE: the single attached image emerald-illustration.png is the user-approved AN KHANG HOME email. Preserve only its top banner visual: emerald green background, white Vietnamese large headline on the left, cream apartment building with green windows on the right, cream agreement document and green key at bottom right, restrained mint cloud and foliage forms, and curved pale mint lower edge. Preserve this same polished flat illustration style, hierarchy and composition. EXACT REQUESTED CHANGE: extract/recreate that banner as a standalone full bleed landscape asset with NO body email text and NO border or outer margins. Reserve a completely EMPTY uniform dark emerald rectangle in the upper left x=70..570 y=45..155 (1200x660 coordinate system) for a supplied real Electron logo to be composited afterward by the main developer. DO NOT draw any logo or wordmark anywhere. Large white headline XÁC NHẬN on one line then HỢP ĐỒNG on the next at left starting around x80 y250; preserve Vietnamese diacritics exactly, with ample clear margins. Building occupies x690..1160 and y110..500; cream agreement document and key near x910..1150 y320..625. Main illustration remains fully within image. Pale mint curve connects lower edge to white. Final size request 1200x660. AVOID: logo, AK monogram, AN KHANG HOME wordmark, fake supplied logo, brand text, browser chrome, email body, greeting, buttons, cards, frames, outer neutral margins, shadows, clipping, gradients replacing the flat visual, photorealism, glossy 3D, people, illegible or misspelled Vietnamese, decorative text other than exact headline. This is a banner asset, not a complete email screenshot.`
async function main() {
  const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
  if (!base) throw new Error('NINEROUTER_URL missing')
  const headers = {'Content-Type':'application/json', Authorization:`Bearer ${process.env.NINEROUTER_KEY || ''}`}
  const model = process.env.PRODUCT_DESIGN_IMAGE_MODEL || 'cx/gpt-5.5-image'
  for(let attempt=1; attempt<=3; attempt++) {
    try {
      const catalog = await fetch(`${base}/v1/models/image`,{headers,signal:AbortSignal.timeout(20000)})
      if(!catalog.ok) throw new Error(`Catalog HTTP ${catalog.status}`)
      if(!(await catalog.json()).data?.some(item=>item.id===model)) throw new Error('Requested model unavailable')
      const response = await fetch(`${base}/v1/images/generations`,{method:'POST',headers,signal:AbortSignal.timeout(300000),body:JSON.stringify({model,prompt,image:`data:image/png;base64,${fs.readFileSync(source).toString('base64')}`,n:1,size:'1200x660',response_format:'b64_json'})})
      const raw=await response.text()
      if(!response.ok) throw new Error(`Generation HTTP ${response.status}: ${raw.slice(0,100)}`)
      let payload
      try {payload=JSON.parse(raw)} catch {
        for(const line of raw.split('\n')) if(line.startsWith('data:')) {try {const event=JSON.parse(line.slice(5)); if(event.data?.[0]?.b64_json || event.b64_json) payload=event} catch{}}
      }
      const encoded=payload?.data?.[0]?.b64_json || payload?.b64_json
      if(!encoded) throw new Error('No base64 image in response')
      const bytes=Buffer.from(encoded,'base64')
      fs.writeFileSync(path.join(__dirname,'banner-generated.png'),bytes)
      await sharp(bytes).resize(1200,660,{fit:'fill'}).png().toFile(output)
      fs.writeFileSync(path.join(__dirname,'generation.json'),JSON.stringify({model,source,prompt,output},null,2))
      console.log(output)
      return
    } catch(error) {
      console.error(`Attempt ${attempt}: ${error.message}`)
      if(attempt===3 || /401|403|unavailable/.test(error.message)) throw error
    }
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
