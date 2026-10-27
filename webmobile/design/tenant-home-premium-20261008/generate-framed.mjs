import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const dir=path.dirname(fileURLToPath(import.meta.url))
const reference=path.join(dir,'quiet-editorial-current.png')
const output=path.join(dir,'quiet-editorial-framed.png')
const base=process.env.NINEROUTER_URL?.replace(/\/$/,'')
if(!base)throw new Error('NINEROUTER_URL unavailable')
const headers={'Content-Type':'application/json',...(process.env.NINEROUTER_KEY?{Authorization:`Bearer ${process.env.NINEROUTER_KEY}`}:{})}
const model=process.env.PRODUCT_DESIGN_IMAGE_MODEL||'cx/gpt-5.5-image'
const image=`data:image/png;base64,${(await readFile(reference)).toString('base64')}`
const prompt=`Create ONE refined mobile website homepage image demo. AUTHORITATIVE REFERENCE: the attached quiet-editorial-current.png is option 1 selected by the user. It is attached intentionally as the approved visual source, not as a generic inspiration. Preserve the exact existing AK / AN KHANG HOME logo, forest-green header, green/mint/white palette, Vietnamese content, all data, order and hierarchy. Current date 08/10/2026, start date stays 8/10/2026.
EXACT REQUESTED CHANGE: make this selected design feel like a contained mobile app by giving the entire app content a subtle continuous rounded outer frame, a fine forest-green-tinted 1px border, 16px corner radius, a very light shadow, and only 8px neutral outer inset. Header connects seamlessly to the top corners of the frame. App content stays inside this one complete frame, with naturally rounded bottom corners below the payment note. This is an APP UI FRAME, not a physical phone bezel. Group electricity/water plus Internet/cleaning into one clean lightly bordered rounded section as in the selected design, and retain the flat asset list with hairline dividers. Compact precise alignment, no tall empty bottom space. Keep proportions natural and comfortable readable 14–16px body at logical 390×844 viewport. Output ONE portrait mobile screen, app content only, full outer frame visible on all four edges; fit all content without clipping or stretching.
VISIBLE DATA unchanged: Xin chào, Đỗ Kim Ngân, Phòng 999, Tầng 1, Giá thuê hiện tại 3.500.000đ/tháng, Ngày bắt đầu 8/10/2026, Ngày lập hóa đơn: ngày 5 hằng tháng; Điện, Đơn giá 3.200đ/kWh, Khi nhận phòng 10 kWh; Nước, Đơn giá 35.000đ/m³, Khi nhận phòng 10 m³; Internet 50.000đ/tháng, Vệ sinh 70.000đ/tháng; Tài sản trong phòng with refresh icon: Bóng đèn / Hoạt động tốt / SL 1 and Thiết bị vệ sinh / Hoạt động tốt / SL 1; Thanh toán / Chưa có hóa đơn mới trên website. Keep left menu icon functional-looking and at least 44px touch target. These utility readings are move-in baselines; never monthly consumption or current readings. No room area exists.
AVOID: fake phone body, bezel, notch, OS status bar, browser controls, bottom navigation, thick decorative frame, heavy shadow, gradients, cards inside cards, extra panels around every row, giant headings, gold or blue, changed logo, invented area or assets, QR or payment CTA, hidden data, removed inventory, truncated Vietnamese, multiple options in one image. Only this selected option with requested frame refinement.`
for(let attempt=1;attempt<=3;attempt++){
 try{
  const c=await fetch(`${base}/v1/models/image`,{headers,signal:AbortSignal.timeout(20000)})
  if(!c.ok)throw new Error(`Catalog HTTP ${c.status}`)
  if(!(await c.json()).data?.some(x=>x.id===model))throw new Error('Model unavailable')
  console.log(`Generating framed refinement, attempt ${attempt}`)
  const r=await fetch(`${base}/v1/images/generations`,{method:'POST',headers,signal:AbortSignal.timeout(300000),body:JSON.stringify({model,prompt,image,n:1,size:'1024x1536',response_format:'b64_json'})})
  const raw=await r.text();if(!r.ok)throw new Error(`Generation HTTP ${r.status}`)
  let payload;try{payload=JSON.parse(raw)}catch{for(const line of raw.split('\n'))if(line.startsWith('data:'))try{const p=JSON.parse(line.slice(5));if(p.data?.[0]?.b64_json||p.b64_json)payload=p}catch{}}
  const bytes=payload?.data?.[0]?.b64_json||payload?.b64_json;if(!bytes)throw new Error('No image bytes returned')
  await writeFile(output,Buffer.from(bytes,'base64'))
  await writeFile(output.replace('.png','.json'),JSON.stringify({reference,model,prompt,output,status:'refinement-awaiting-approval'},null,2)+'\n')
  console.log(output);break
 }catch(e){console.error(e.message);if(attempt===3||/401|403|unavailable/.test(e.message))throw e}
}
