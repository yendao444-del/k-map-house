import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, Copy, History, LoaderCircle, RefreshCw, PencilLine, FlaskConical, RotateCcw } from 'lucide-react'
import type { TenantProfile } from './auth-client'
import NativeMeterInput, { type NativeMeterHandle } from './NativeMeterInput'
import { checkManualMeterReading, checkMeterReading, parseManualReading, recognizeMeter, simulateMeterReading, type Meter, type MeterReadResult } from './meter-reading'
import { sandboxPaymentApi, sandboxResetApi, tenantPaymentApi, type TenantPaymentState } from './tenant-payments'

const cash=(n:number)=>`${Number(n||0).toLocaleString('vi-VN')}đ`
const date=(s?:string)=>s?s.slice(0,10).split('-').reverse().join('/'):'—'
export default function TenantPayment({profile,onCameraState}:{profile:TenantProfile;onCameraState?:(open:boolean)=>void}) {
 const [state,setState]=useState<TenantPaymentState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [view,setView]=useState<'summary'|'capture'|'review'|'manual'|'manual-review'>('summary'),[meter,setMeter]=useState<Meter>('electric')
 const [cameraFailures,setCameraFailures]=useState({electric:0,water:0})
 const [photo,setPhoto]=useState(''),[result,setResult]=useState<MeterReadResult|null>(null),[digits,setDigits]=useState(''),[reading,setReading]=useState(false),[autoNotice,setAutoNotice]=useState('')
 const [history,setHistory]=useState(false),[selected,setSelected]=useState<string|null>(null),[copied,setCopied]=useState(false)
 const file=useRef<NativeMeterHandle>(null),active=useRef(true),task=useRef<AbortController|null>(null),photoUrl=useRef(''),syncing=useRef<Promise<TenantPaymentState>|null>(null),currentView=useRef(view)
 currentView.current=view
 useEffect(()=>{onCameraState?.(false)},[onCameraState])
 async function refresh(signal?:AbortSignal,required=false):Promise<TenantPaymentState|null> {
  // A mutation needs a fresh snapshot even if an earlier poll is in flight.
  if(syncing.current){if(!required)return null;try{await syncing.current}catch{/* Fetch a fresh snapshot below. */}}
  if(signal?.aborted)return null
  const request=tenantPaymentApi('state',signal);syncing.current=request
  try {const next=await request;if(active.current&&!signal?.aborted)setState(next);return next}
  catch(cause){if(required)throw cause;if(active.current&&!signal?.aborted&&currentView.current==='summary')setError(cause instanceof Error?cause.message:'Chưa tải được thanh toán.');return null}
  finally{if(syncing.current===request)syncing.current=null}
 }
 useEffect(()=>{
  active.current=true;const controller=new AbortController();void refresh(controller.signal)
  const sync=()=>{if(document.visibilityState==='visible'&&currentView.current==='summary')void refresh(controller.signal)}
  const timer=window.setInterval(sync,10000);window.addEventListener('focus',sync)
  return()=>{active.current=false;controller.abort();syncing.current=null;task.current?.abort();clearInterval(timer);window.removeEventListener('focus',sync);if(photoUrl.current)URL.revokeObjectURL(photoUrl.current)}
 },[profile.contractId])
 const cy=state?.cycle
 const invoices=state?.invoices||[]
 const invoice=invoices.find(i=>i.id===selected)||invoices.find(i=>i.remaining>0)||invoices[0]
 const label=meter==='electric'?'điện':'nước',unit=meter==='electric'?'kWh':'m³'
 const old=cy?.[meter==='electric'?'electric_old':'water_old']
 const supportsManual=!!profile.simulation||!!state?.manualFallback
 const manualAvailable=supportsManual&&(!!state?.manualFallback?.[meter]||cameraFailures[meter]>=2)
 function openManual(){task.current?.abort();setReading(false);setDigits('');setError('');setView('manual')}
 function begin(){setError('');setAutoNotice('');setMeter(cy?.electric_new==null?'electric':'water');setView('capture')}
 function choosePhoto(){setError('');file.current?.open()}
 function cameraFailed(message:string){setCameraFailures(v=>({...v,[meter]:v[meter]+1}));setError(message)}
 async function simulateCurrentMeter(target:Meter) {
  if(!profile.simulation||busy||reading)return
  task.current?.abort();const controller=new AbortController();task.current=controller
  setBusy(true);setError('');setAutoNotice('');setMeter(target);setPhoto(`/assets/meter-${target}.webp`);setResult(null);setDigits('');setView('review');setReading(true)
  try{
   const next=await simulateMeterReading(target,profile.contractId,controller.signal)
   if(!active.current||controller.signal.aborted)return
   setResult(next);if(next.ok)setDigits(next.digits)
   else setError(next.reason)
  }catch(cause){if(active.current&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Chưa tạo được chỉ số kiểm nghiệm.')}
  finally{if(active.current&&!controller.signal.aborted){setReading(false);setBusy(false)}}
 }
 async function take(blob:Blob) {
  task.current?.abort();const controller=new AbortController();task.current=controller
  if(photoUrl.current)URL.revokeObjectURL(photoUrl.current)
  const url=URL.createObjectURL(blob);photoUrl.current=url;setPhoto(url);setResult(null);setDigits('');setError('');setView('review');setReading(true)
  try {
   const next=await recognizeMeter(url,meter,profile.contractId,controller.signal)
   if(!active.current||controller.signal.aborted)return
   setResult(next);if(next.ok)setDigits(next.digits)
   // An OCR value that fails the old/new policy is also an unsuccessful read.
   // Refresh the server failure counter before deciding whether manual entry opens.
   if(!next.ok || (next.ok && next.assessment.status !== 'pass'))await refresh(controller.signal)
  }catch(cause){if(active.current&&!controller.signal.aborted){await refresh(controller.signal);setError(cause instanceof Error&&cause.name==='TimeoutError'?'AI phản hồi chậm. Hãy thử lại.':cause instanceof Error?cause.message:'Chưa đọc được ảnh. Hãy chụp lại rõ hơn.')}}
  finally{if(active.current&&!controller.signal.aborted)setReading(false)}
 }
 async function advanceAfterConfirmation(signal?:AbortSignal,acceptedReading=parseManualReading(digits)){
  let next:TenantPaymentState|null
  try{next=await refresh(signal,true)}catch(cause){if(active.current&&!signal?.aborted){setAutoNotice('Chỉ số đã được ghi nhận.');setView('summary')}throw cause}
  if(!active.current||signal?.aborted)return
  if(next?.cycle?.invoice_id){setSelected(next.cycle.invoice_id);setView('summary');return}
  if(meter==='electric'){
   setAutoNotice(`Đã ghi nhận điện ${acceptedReading??'—'} kWh. Chuyển sang chụp nước.`)
   setMeter('water');setResult(null);setDigits('');setView('capture')
  } else {
   setAutoNotice('Đã ghi nhận điện nước.');setView('summary')
   const created=await tenantPaymentApi('create',signal)
   await refresh(signal,true);if(active.current&&!signal?.aborted){setSelected(created.invoiceId);setAutoNotice('Đã ghi nhận điện nước và lập hóa đơn.');setView('summary')}
  }
 }
 async function create(){
  setBusy(true);setError('');try{const created=await tenantPaymentApi('create');if(active.current){await refresh(undefined,true);setSelected(created.invoiceId);setView('summary')}}
  catch(cause){if(active.current)setError(cause instanceof Error?cause.message:'Chưa lập được hóa đơn.')}
  finally{if(active.current)setBusy(false)}
 }
 async function confirm(){
  const n=parseManualReading(digits)
  const manual=view==='manual-review'&&manualAvailable
  if(n==null||(!manual&&(!result?.ok||!result.reviewToken))||busy)return
  const controller=new AbortController();task.current=controller;setBusy(true);setError('')
  try{
   const checked=manual?await checkManualMeterReading(n,meter,profile.contractId,cameraFailures[meter]>=2,controller.signal):await checkMeterReading(n,meter,profile.contractId,result!.ok?result!.reviewToken!:'',result!.ok&&n===result!.reading?'ai-ocr':'manual',controller.signal)
   if(!active.current||controller.signal.aborted)return
   if(!checked.ok)throw new Error(checked.reason)
   await advanceAfterConfirmation(controller.signal)
  }catch(cause){if(active.current&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Chưa xác nhận được chỉ số.')}
  finally{if(active.current&&!controller.signal.aborted)setBusy(false)}
 }
 async function resetSimulation(){
  if(!profile.simulation||busy)return
  task.current?.abort();setBusy(true);setError('')
  try{
   await sandboxResetApi()
   if(!active.current)return
   setSelected(null);setHistory(false);setCopied(false);setCameraFailures({electric:0,water:0});setMeter('electric');setPhoto('');setResult(null);setDigits('');setReading(false);setAutoNotice('Đã tạo lại kỳ kiểm nghiệm.')
   await refresh(undefined,true)
  }catch(cause){if(active.current)setError(cause instanceof Error?cause.message:'Chưa tạo lại được kỳ kiểm nghiệm.')}
  finally{if(active.current)setBusy(false)}
 }
 async function runTestStep(){
  if(!profile.simulation||busy||reading)return
  if(view==='review'){await confirm();return}
  if(view==='capture'){await simulateCurrentMeter(meter);return}
  if(invoice&&invoice.payment_status!=='paid'){
   setBusy(true);setError('')
   try{await sandboxPaymentApi(invoice.id);await refresh(undefined,true);if(active.current){setSelected(invoice.id);setAutoNotice('Đã ghi nhận thanh toán kiểm nghiệm.');setView('summary')}}
   catch(cause){if(active.current)setError(cause instanceof Error?cause.message:'Chưa ghi nhận được thanh toán kiểm nghiệm.')}
   finally{if(active.current)setBusy(false)}
   return
  }
  const target=cy?.electric_new==null?'electric':'water'
  await simulateCurrentMeter(target)
 }
 const passed=result?.ok&&result.assessment.status==='pass'&&!!result.reviewToken
 const usage=parseManualReading(digits)!=null&&old!=null?Number(digits)-old:null
 const waitingForNextCycle=!!state?.blockedReason&&state.blockedReason.startsWith('Hóa đơn tháng đầu')
 let nextCycleDate=state?.nextDate
 // First-month handover remains separate; monthly readings start next month.
 if(waitingForNextCycle&&nextCycleDate?.slice(0,7)===profile.start.slice(0,7)){
  const [year,month]=profile.start.split('-').map(Number)
  const nextMonth=new Date(Date.UTC(year,month,1))
  const day=Math.min(Math.max(profile.invoiceDay??Number(nextCycleDate.slice(8,10)),1),new Date(Date.UTC(nextMonth.getUTCFullYear(),nextMonth.getUTCMonth()+1,0)).getUTCDate())
  nextMonth.setUTCDate(day);nextCycleDate=nextMonth.toISOString().slice(0,10)
 }
 const awaitingCycle=!!state&&(!cy||!!cy.invoice_id)&&!invoices.some(i=>i.remaining>0)&&(!state.blockedReason||waitingForNextCycle)
 const lines: [string,number][] = invoice ? [
 ['Tiền phòng',invoice.room_cost],['Điện',invoice.electric_cost],['Nước',invoice.water_cost],['Internet',invoice.wifi_cost],['Vệ sinh',invoice.garbage_cost],
 ['Nợ kỳ trước',invoice.old_debt],['Nợ hóa đơn gộp',invoice.merged_debt_total||0],['Tiền cọc / hoàn cọc',invoice.deposit_amount||0],
 ['Khấu trừ cọc',-(invoice.deposit_applied||0)],['Hư hỏng',invoice.damage_amount||0],['Điều chỉnh',invoice.adjustment_amount||0],
 ['Phòng cũ',invoice.transfer_room_cost||0],['Điện phòng cũ',invoice.transfer_electric_cost||0],['Nước phòng cũ',invoice.transfer_water_cost||0],['Dịch vụ phòng cũ',invoice.transfer_service_cost||0]
 ].filter(([name,n])=>Number(n)!==0||['Tiền phòng','Điện','Nước'].includes(String(name))) as [string,number][] : []
 return <section className="tenant-payment-workflow">
  <NativeMeterInput ref={file} label={label} onPhoto={blob=>void take(blob)} onFailure={cameraFailed}/>
  {view==='capture'?<>
   <p className="badge pending">Bước {meter==='electric'?'1':'2'}/2 · {cy?.period.slice(0,7).split('-').reverse().join('/')}</p>
   <h2>Chụp công tơ {label}</h2><p>Số đầu kỳ: <strong>{old} {unit}</strong></p>
   <figure className="tenant-meter-example"><img src={`/assets/meter-${meter}.webp`} alt={`Ảnh mẫu công tơ ${label}`} /><figcaption>Chụp rõ dãy số như ảnh mẫu, tránh lóa kính.</figcaption></figure>
   {autoNotice&&<p className="payment-status" role="status"><CheckCircle2/> {autoNotice}</p>}
   <div className="tenant-capture-actions"><button className="primary-button" onClick={choosePhoto}><Camera/>Chụp ảnh {label}</button>{manualAvailable&&<button className="secondary-button" onClick={openManual}><PencilLine/>Nhập chỉ số thủ công</button>}{profile.simulation&&<button className="secondary-button" disabled={busy||reading} onClick={()=>void runTestStep()}><FlaskConical/>Kiểm nghiệm</button>}</div>
   <button className="text-button" onClick={()=>setView('summary')}>Để sau</button>
  </>:view==='manual'?<>
   <p className="badge pending">Bước {meter==='electric'?'1':'2'}/2 · Nhập thủ công</p><h2>Nhập số {label}</h2>
   <p>Số đầu kỳ: <strong>{old} {unit}</strong></p>
   <label className="tenant-reading-label">Chỉ số mới ({unit})<input autoFocus inputMode="numeric" pattern="[0-9]*" maxLength={8} value={digits} disabled={busy} onChange={e=>{setDigits(e.target.value);setError('')}}/></label>
   {usage!=null&&usage>=0&&<p>Tiêu thụ: <strong>{usage} {unit}</strong></p>}
   <p className="tenant-page-hint">Nhập số nguyên, bỏ phần thập phân màu đỏ.</p>
   <button className="primary-button" disabled={busy||parseManualReading(digits)==null||usage==null||usage<0} onClick={()=>{setError('');setView('manual-review')}}>Tiếp tục · Kiểm tra số</button>
   <button className="secondary-button" disabled={busy} onClick={()=>setView('capture')}>Quay lại chụp ảnh</button>
  </>:view==='manual-review'?<>
   <h2>Xác minh số {label}</h2>
   <p className="badge pending">Chỉ số nhập thủ công</p>
   <label className="tenant-reading-label">Chỉ số mới ({unit})<input inputMode="numeric" pattern="[0-9]*" maxLength={8} value={digits} disabled={busy} onChange={e=>{setDigits(e.target.value);setError('')}}/></label>
   <p>Số cũ {old} → số mới {digits||'—'}{usage!=null&&usage>=0?` · ${usage} ${unit}`:''}</p>
   <p className="tenant-page-hint">Đối chiếu số trên công tơ rồi bấm xác nhận.</p>
   <button className="primary-button" disabled={!manualAvailable||busy||parseManualReading(digits)==null||usage==null||usage<0} onClick={()=>void confirm()}>{busy?'Đang lưu…':meter==='electric'?'Xác nhận · Tiếp tục nước':'Xác nhận · Lập hóa đơn'}</button>
   <button className="secondary-button" disabled={busy} onClick={()=>setView('manual')}>Sửa số đã nhập</button>
  </>:view==='review'?<>
   <h2>Xác minh số {label}</h2><img className="tenant-meter-photo" src={photo} alt={`Ảnh công tơ ${label} vừa chụp`}/>
   {reading?<p role="status"><LoaderCircle className="reading-spinner"/>Đang đọc và kiểm tra từng chữ số…</p>:<>
    {result?.ok&&result.assessment.status==='pass'?<><label className="tenant-reading-label">Chỉ số mới ({unit})<input inputMode="numeric" pattern="[0-9]*" value={digits} disabled={!passed||busy} onChange={e=>{setDigits(e.target.value);setError('')}}/></label><p>Số cũ {old} → số mới {digits||'—'}{usage!=null&&usage>=0?` · ${usage} ${unit}`:''}</p></>:result?.ok?<p className="error-message" role="alert">{result.assessment.reason}</p>:result&&<p className="error-message" role="alert">{result.reason}</p>}
    {passed&&<><p className="payment-status" role="status"><CheckCircle2/> Chỉ số đã qua kiểm tra. Đối chiếu dãy số trong ảnh rồi xác nhận.</p><p className="tenant-page-hint">Bạn vẫn có thể sửa số nếu ảnh đọc chưa đúng.</p></>}
    {result?.ok&&result.assessment.status==='pass'&&<button className="primary-button" disabled={!passed||parseManualReading(digits)==null||usage==null||usage<0||busy} onClick={()=>void confirm()}>{busy?'Đang lưu…':meter==='electric'?'Xác nhận · Tiếp tục nước':'Xác nhận · Lập hóa đơn'}</button>}
    {profile.simulation&&<button className="secondary-button" disabled={!passed||busy||reading} onClick={()=>void runTestStep()}><FlaskConical/>Kiểm nghiệm · Xác nhận</button>}
    <button className="secondary-button" disabled={busy} onClick={choosePhoto}><Camera/>Chụp lại</button>
    {manualAvailable&&<button className="secondary-button" disabled={busy} onClick={openManual}><PencilLine/>Nhập chỉ số thủ công</button>}
   </>}
  </>:<>
   {autoNotice&&<p className="payment-status" role="status">{autoNotice}</p>}
   {!state&&!error?<p role="status">Đang tải kỳ thanh toán…</p>:<>
    {awaitingCycle&&<section className="tenant-payment-notice is-waiting" role="status">
     <h2>Chưa tới kỳ thanh toán</h2>
     <p className="tenant-next-payment">Kỳ tiếp theo: <strong>{date(nextCycleDate)}</strong></p>
     <p className="tenant-page-hint">Bạn sẽ nhận email khi đến kỳ ghi số điện & nước.</p>
    </section>}
    {state?.blockedReason&&!waitingForNextCycle&&<section className="tenant-payment-notice" role="status">
     <span className="badge pending">{waitingForNextCycle?'Chưa tới kỳ':'Chưa thể mở kỳ'}</span>
     <h2>{waitingForNextCycle?'Chưa tới kỳ thanh toán':'Chưa thể mở kỳ thanh toán'}</h2>
     <p>{state.blockedReason}</p>
    </section>}
    {cy&&!cy.invoice_id&&<section className="tenant-payment-cycle"><span className="badge pending">Kỳ {cy.period.slice(0,7).split('-').reverse().join('/')}</span><h2>Ghi số điện & nước</h2><p>Điện: {cy.electric_new==null?'Chưa gửi':`${cy.electric_new} kWh`} · Nước: {cy.water_new==null?'Chưa gửi':`${cy.water_new} m³`}</p><button className="primary-button" disabled={busy||reading} onClick={()=>cy.electric_new!=null&&cy.water_new!=null?void create():begin()}>{busy||reading?'Đang lập hóa đơn…':cy.electric_new!=null&&cy.water_new!=null?'Lập hóa đơn':cy.electric_new!=null?'Tiếp tục chụp nước':'Chụp điện & nước'}</button>{profile.simulation&&<button className="secondary-button" disabled={busy||reading} onClick={()=>void runTestStep()}><FlaskConical/>Kiểm nghiệm</button>}</section>}
    {invoice?<section className="compact-payment tenant-real-invoice">
     <div className="tenant-invoice-heading"><h2>Hóa đơn {String(invoice.month).padStart(2,'0')}/{invoice.year}</h2><span className={`badge ${invoice.payment_status==='paid'?'success':'pending'}`}>{invoice.payment_status==='paid'?'Đã thanh toán':invoice.paid_amount>0?'Còn phải trả':'Chờ thanh toán'}</span></div>
     <p className="payment-room">{profile.room} · {profile.name}</p>
     {invoice.payment_status==='paid'&&<CheckCircle2 className="payment-success-icon"/>}<strong className="payment-total">{cash(invoice.payment_status==='paid'?invoice.total_amount:invoice.remaining)}</strong>
     <p className="tenant-page-hint">{date(invoice.billing_period_start)} – {date(invoice.billing_period_end)} · Hạn {date(invoice.due_date)}</p>
     <dl className="tenant-invoice-lines">{lines.map(([name,n])=><div key={name} className={name==='Điện'||name==='Nước'?'utility-line':''}><dt>{name}{name==='Điện'&&<small>{invoice.electric_old} → {invoice.electric_new} · {invoice.electric_usage} kWh × {cash(invoice.electric_price_snapshot)}</small>}{name==='Nước'&&<small>{invoice.water_old} → {invoice.water_new} · {invoice.water_usage} m³ × {cash(invoice.water_price_snapshot)}</small>}</dt><dd>{cash(n)}</dd></div>)}<div><dt>Tổng hóa đơn</dt><dd>{cash(invoice.total_amount)}</dd></div>{invoice.paid_amount>0&&<div><dt>Đã nhận</dt><dd>{cash(invoice.paid_amount)}</dd></div>}</dl>
     {invoice.payment_status==='paid'?<p role="status" className="payment-status">{`Đã ghi nhận · ${date(invoice.payment_date)}. Hóa đơn này là xác nhận thanh toán của bạn.`}</p>:<>
      {state?.notices.some(n=>n.invoiceId===invoice.id)&&<p role="status" className="error-message">Có giao dịch chưa khớp số tiền. Chủ nhà cần đối soát; chưa chuyển thêm khi chưa kiểm tra.</p>}
      {invoice.qr&&state?.bank?<><div className="payment-qr"><img src={invoice.qr} alt={`QR thanh toán · ${state.bank.owner}`} width="200" height="200"/><p>{state.bank.owner} · {state.bank.name}</p><strong>{state.bank.account}</strong></div><div className="payment-reference"><span>Nội dung chuyển khoản</span><strong>{invoice.transferContent}</strong><button className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText(invoice.transferContent);setCopied(true)}catch{setError('Chưa sao chép được. Hãy chọn mã để sao chép.')}}}><Copy/> {copied?'Đã sao chép':'Sao chép'}</button></div><p className="recipient-warning">Chỉ chuyển vào <strong>Đỗ Kim Ngân · BIDV</strong>, đúng số tài khoản và giữ nguyên nội dung chuyển khoản trên.</p></>:<p role="alert" className="error-message">Chưa có cấu hình tài khoản nhận tiền hợp lệ. Vui lòng liên hệ chủ nhà.</p>}
      <p className="payment-status" role="status">Trạng thái thanh toán sẽ tự cập nhật sau khi khớp giao dịch.</p><button className="text-button" onClick={()=>void refresh()}><RefreshCw/>Kiểm tra thanh toán</button>{profile.simulation&&<button className="secondary-button" disabled={busy} onClick={()=>void runTestStep()}><FlaskConical/>Kiểm nghiệm</button>}
     </>}
     {profile.simulation&&<button className="secondary-button" disabled={busy} onClick={()=>void resetSimulation()}><RotateCcw/>Tạo lại kiểm nghiệm</button>}
    </section>:null}
    {invoices.length>1&&<><button className="secondary-button" aria-expanded={history} onClick={()=>setHistory(!history)}><History/>Hóa đơn & lịch sử ({invoices.length})</button>{history&&<ul className="tenant-payment-history">{invoices.map(i=><li key={i.id}><button onClick={()=>{setSelected(i.id);setCopied(false);setHistory(false)}}><span>{String(i.month).padStart(2,'0')}/{i.year}<small>{i.payment_status==='paid'?'Đã trả':`Còn ${cash(i.remaining)}`}</small></span><strong>{cash(i.total_amount)}</strong></button></li>)}</ul>}</>}
   </>}
  </>}
  {error&&<div role="alert" className="error-message">{error}{view==='summary'&&<button className="text-button" onClick={()=>{setError('');void refresh()}}>Thử lại</button>}</div>}
 </section>
}
