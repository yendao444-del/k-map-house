// Local-only browser QA. Synthetic camera and OCR fixtures, no provider keys,
// database, external mail or bank calls. Never included in the Pages build.
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root=fileURLToPath(new URL('../../',import.meta.url))
const entry=path.join(root,'test/room999-payment/camera-qa-entry.tsx')
const output=await build({entryPoints:[entry],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic'})
const artifacts=path.join(root,'test/room999-payment/artifacts');await mkdir(artifacts,{recursive:true})
let cycle,invoices,confirmations
function reset(){cycle={id:'camera-qa',period:'2026-10-01',period_start:'2026-10-01',period_end:'2026-10-31',electric_old:12600,water_old:280,electric_new:null,water_new:null,invoice_id:null};invoices=[];confirmations=[]}reset()
const respond=(res,data)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data))}
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),name=url.pathname
 if(name==='/reset'){reset();res.writeHead(302,{Location:'/?screen=payment&case='+encodeURIComponent(url.searchParams.get('case')||'working')});res.end();return}
 if(name==='/evidence'){respond(res,{cycle,invoices,confirmations});return}
 if(name==='/api/tenant-payments'||name==='/api/meter-ocr'){
  let text='';for await(const c of req){text+=c;if(text.length>4100000)throw Error('too large')}
  const data=JSON.parse(text||'{}')
  if(name==='/api/tenant-payments'){
   if(data.action==='create'){
    if(cycle.electric_new==null||cycle.water_new==null)throw Error('Both readings must be confirmed')
    cycle.invoice_id='camera-qa-invoice';invoices=[{id:cycle.invoice_id,month:10,year:2026,invoice_date:'2026-10-10',due_date:'2026-10-15',billing_period_start:cycle.period_start,billing_period_end:cycle.period_end,billing_reason:'monthly',room_cost:3500000,wifi_cost:50000,garbage_cost:70000,old_debt:0,electric_old:12600,electric_new:cycle.electric_new,electric_usage:cycle.electric_new-12600,electric_cost:(cycle.electric_new-12600)*3200,electric_price_snapshot:3200,water_old:280,water_new:cycle.water_new,water_usage:cycle.water_new-280,water_cost:(cycle.water_new-280)*35000,water_price_snapshot:35000,total_amount:4159400,remaining:4159400,paid_amount:0,payment_status:'unpaid',qr:null,transferContent:'QA-NOT-A-TRANSFER'}]
    respond(res,{ok:true,invoiceId:cycle.invoice_id});return
   }
   respond(res,{ok:true,cycle,invoices,bank:null,notices:[],manualFallback:{electric:false,water:false},simulation:{noWrites:true}});return
  }
  const reading=data.meter==='electric'?12692:287
  if(data.mode==='check'||data.mode==='manual'){
   if(data.mode==='check'&&data.reviewToken!==`qa-${data.meter}`)throw Error('Invalid review token')
   if(!Number.isSafeInteger(data.reading)||data.reading<cycle[`${data.meter}_old`])throw Error('Invalid reading')
   confirmations.push({meter:data.meter,source:data.mode==='manual'?'manual':'ai-ocr',reading:data.reading});cycle[`${data.meter}_new`]=data.reading
   await writeFile(path.join(artifacts,'camera-qa-flow.json'),JSON.stringify({synthetic:true,noDatabaseWrites:true,cycle,confirmations},null,2))
   respond(res,{ok:true,source:data.mode==='manual'?'manual':'ai-ocr',assessment:{status:'pass',reason:''},confirmationToken:'qa-confirmed'});return
  }
  if(!data.image?.startsWith('data:image/jpeg;base64,'))throw Error('Missing photo')
  respond(res,{ok:true,reading,digits:String(reading),unit:data.meter==='electric'?'kWh':'m3',source:'ai-ocr',needsConfirmation:true,assessment:{status:'pass',reason:''},reviewToken:`qa-${data.meter}`});return
 }
 if(name==='/bundle.js'){res.setHeader('Content-Type','application/javascript');res.end(output.outputFiles[0].contents);return}
 if(name==='/styles.css'){res.setHeader('Content-Type','text/css');res.end(await readFile(path.join(root,'src/styles.css')));return}
 if(name.startsWith('/assets/')&&!name.includes('..')){res.setHeader('Content-Type',name.endsWith('.webp')?'image/webp':name.endsWith('.woff2')?'font/woff2':'image/png');res.end(await readFile(path.join(root,'public',name)));return}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>')
}catch(e){res.statusCode=400;respond(res,{ok:false,reason:e.message})}})
server.listen(5299,'127.0.0.1',()=>console.log('Synthetic camera QA: http://127.0.0.1:5299/?screen=payment&case=working'))
