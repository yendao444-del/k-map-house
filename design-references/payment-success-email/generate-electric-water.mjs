import { readFile, writeFile } from 'node:fs/promises'
const base = process.env.NINEROUTER_URL?.replace(/\/$/, '')
const headers = { 'Content-Type': 'application/json', ...(process.env.NINEROUTER_KEY ? { Authorization: 'Bearer ' + process.env.NINEROUTER_KEY } : {}) }
const image = 'data:image/png;base64,' + (await readFile('C:/Users/Admin/AppData/Local/Temp/codex-clipboard-34da3f25-da4f-4b34-ab29-c23c06fc4971.png')).toString('base64')
const prompt = `Create one realistic production-quality Gmail email screenshot for AN KHANG HOME, based on the attached screenshot as the ONE AUTHORITATIVE REFERENCE. Preserve the current clean white email body, green success styling, Vietnamese labels, invoice hierarchy, room 261, Hóa đơn tháng 10/2026, transaction ID 9e2bb9da-8c1c-4566-994b-18a82a028e3b, Kênh SePay, and the existing amounts: Tiền phòng 2.200.000 đ, Tiền điện 454.400 đ, Tiền nước 105.000 đ, Internet 50.000 đ, Vệ sinh 100.000 đ, Tổng hóa đơn 2.909.400 đ, Đã thanh toán 2.909.400 đ, Còn lại 0 đ. EXACT REQUESTED CHANGE: for the landlord email sent to phongtroankhang.com@gmail.com, make the electricity and water readings explicit in the invoice details. Add two readable subsections/rows: Điện — Chỉ số đầu kỳ 1.245 kWh, chỉ số cuối kỳ 1.387 kWh, sử dụng 142 kWh, đơn giá 3.200 đ/kWh, thành tiền 454.400 đ. Nước — Chỉ số đầu kỳ 98 m³, chỉ số cuối kỳ 103 m³, sử dụng 5 m³, đơn giá 21.000 đ/m³, thành tiền 105.000 đ. Keep the summary amounts exactly consistent and show the recipient context subtly as Hóa đơn gửi chủ nhà: phongtroankhang.com@gmail.com. Use a taller desktop Gmail message frame 1536x1350 so all content is visible and unclipped, readable Arial-like Vietnamese text, compact premium spacing, thin separators, green accent. This is one email design, not a comparison board. Avoid external links, new buttons, fake logos, unrelated fields, English labels, sample/test banners, changed totals, clipped text, or multiple screens.`
for (let attempt=1; attempt<=3; attempt++) {
  try {
    const catalog=await fetch(base+'/v1/models/image',{headers,signal:AbortSignal.timeout(15000)})
    if(!catalog.ok) throw new Error('Catalog HTTP '+catalog.status)
    const models=await catalog.json(); const model='cx/gpt-5.5-image'
    if(!models.data?.some(m=>m.id===model)) throw new Error('Required model unavailable')
    const response=await fetch(base+'/v1/images/generations',{method:'POST',headers,body:JSON.stringify({model,prompt,images:[image],n:1,size:'1024x1024',quality:'high',response_format:'b64_json',output_format:'png',image_detail:'high'}),signal:AbortSignal.timeout(300000)})
    const raw=await response.text(); if(!response.ok) throw new Error('Generation HTTP '+response.status+': '+raw.slice(0,300))
    const result=JSON.parse(raw); const b64=result.data?.[0]?.b64_json; if(!b64) throw new Error('No base64 image')
    await writeFile('G:/PHONG TRO/app/design-references/payment-success-email/payment-success-email-electric-water.png',Buffer.from(b64,'base64'))
    console.log('SAVED')
    break
  } catch(e) { console.log('attempt '+attempt+': '+e.message); if(attempt===3) process.exit(1); await new Promise(r=>setTimeout(r,5000)) }
}
