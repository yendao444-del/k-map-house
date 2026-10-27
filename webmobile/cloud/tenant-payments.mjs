import { assessReading } from '../src/meter-policy.mjs'
import { buildInvoiceTransferDescription } from '../server/electron-transfer-adapter.mjs'

const fail=(reason,status=400)=>Object.assign(new Error(reason),{status})
export const fallbackAllowed=result=>result.code!=='wrong_meter'&&result.code!=='multiple_meters'&&!/chưa xác định đúng công tơ|nhiều công tơ/.test(result.reason||'')
export function cycleMeterContext(state,meter) {
 const cy=state.cycle
 if(!cy) throw fail('Chưa đến kỳ gửi chỉ số điện nước.',409)
 const recent=state.invoices.filter(i=>i.billing_reason==='monthly'&&i.billing_period_end<cy.period_start).slice(0,3)
 return {previousReading:cy[`${meter}_old`],elapsedDays:cy.elapsed_days,maxDailyUsage:meter==='electric'?40:2,
 recentDailyUsage:recent.map(i=>i[`${meter}_usage`]/Math.max(1,(Date.parse(i.billing_period_end)-Date.parse(i.billing_period_start))/86400000+1)),
 spikeMultiplier:3,minimumSpikeDailyUsage:meter==='electric'?5:.5}
}
export async function tenantPaymentRequest(profile,endpoint,data,env,rpc,reader,ip,session) {
 if(!profile.contractId) throw fail('Chưa có hợp đồng đang hiệu lực.',409)
 if(data.contractId&&data.contractId!==profile.contractId) throw fail('Bạn không có quyền truy cập hợp đồng này.',403)
 const scope={p_user:profile.userId,p_contract:profile.contractId}
 const state=await rpc('tenant_payment_state',scope)
 if(state.bank?.owner?.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').trim().toUpperCase()==='DO KIM NGAN')state.bank.owner='Đỗ Kim Ngân'
 if(endpoint==='tenant-payments'&&data.action==='state') {
  for(const invoice of state.invoices) {
   invoice.transferContent=buildInvoiceTransferDescription(invoice,profile.room)
   invoice.remaining=Math.max(0,invoice.total_amount-(invoice.paid_amount||0))
   // Use live Electron recipient, never the old demo/environment fallback.
   if(state.bank?.name!=='BIDV'||!/^[A-Za-z0-9]{6,30}$/.test(state.bank?.account||'')||state.bank?.owner!=='Đỗ Kim Ngân') invoice.qr=null
   else if(invoice.remaining>0) {
    const url=new URL('https://qr.sepay.vn/img')
    url.search=new URLSearchParams({bank:state.bank.name,acc:state.bank.account,amount:String(invoice.remaining),des:invoice.transferContent}).toString()
    invoice.qr=url.href
   }
  }
  return {ok:true,...state,manualFallback:{electric:(state.cycle?.electric_ocr_failures||0)>=2,water:(state.cycle?.water_ocr_failures||0)>=2}}
 }
 if(endpoint==='tenant-payments'&&data.action==='create') {
  if(!state.cycle) throw fail('Chưa có kỳ thanh toán để lập hóa đơn.',409)
  const result=await rpc('tenant_payment_write',{...scope,p_cycle:state.cycle.id,p_action:'create',p_data:{}})
  if(typeof result?.invoiceId!=='string'||!result.invoiceId)throw fail('Chưa lập được hóa đơn. Hãy thử lại.',409)
  return {ok:true,invoiceId:result.invoiceId}
 }
 if(endpoint!=='meter-ocr') throw fail('Thao tác không hợp lệ.')
 if(!['electric','water'].includes(data.meter)) throw fail('Loại công tơ không hợp lệ.')
 if(!state.cycle||state.cycle.invoice_id) throw fail('Kỳ này đã có hóa đơn hoặc chưa mở ghi số.',409)
 const context=cycleMeterContext(state,data.meter)
 if(data.mode==='manual') {
  const assessment=assessReading(data.reading,data.meter,context)
  if(assessment.status!=='pass')return {ok:false,assessment,reason:assessment.reason}
  const result=await rpc('tenant_payment_fallback',{...scope,p_cycle:state.cycle.id,p_action:'manual',p_data:{meter:data.meter,reading:data.reading,cameraError:data.cameraError===true}})
  return {ok:true,assessment,...result}
 }
 if(data.mode==='check') {
  const assessment=assessReading(data.reading,data.meter,context)
  if(assessment.status!=='pass') return {ok:false,assessment,reason:assessment.reason}
  const result=await rpc('tenant_payment_write',{...scope,p_cycle:state.cycle.id,p_action:'confirm',p_data:{meter:data.meter,reading:data.reading,reviewToken:data.reviewToken}})
  if(!result||result.invoiceId||!['ai-ocr','manual'].includes(result.source)||typeof result.confirmationToken!=='string'||!result.confirmationToken)throw fail('Chưa xác nhận được chỉ số. Hãy thử lại.',409)
  return {ok:true,assessment,...result}
 }
 const recordFailure=()=>rpc('tenant_payment_fallback',{...scope,p_cycle:state.cycle.id,p_action:'ocr_failure',p_data:{meter:data.meter}})
 if(!env.METER_CLOUD_API_KEY) {await recordFailure();throw fail('Chưa cấu hình dịch vụ đọc ảnh AI online.',503)}
 if(!await rpc('webmobile_demo_quota',{p_ip:ip,p_session:session})) throw fail('Đã đạt giới hạn đọc ảnh hôm nay. Hãy thử lại sau.',429)
 let result
 try{result=await reader(data.image,data.meter,env)}catch(cause){if(['provider_busy','provider_unavailable','provider_quota','provider_failed','provider_auth','model_unavailable'].includes(cause.message)||['TimeoutError','AbortError'].includes(cause.name))await recordFailure();throw cause}
 if(!result.ok) {if(fallbackAllowed(result))await recordFailure();return result}
 const assessment=assessReading(result.reading,data.meter,context)
 if(assessment.status!=='pass') { await recordFailure(); return {...result,assessment,reviewToken:null} }
 const photo=await rpc('tenant_payment_write',{...scope,p_cycle:state.cycle.id,p_action:'photo',p_data:{meter:data.meter,reading:result.reading,image:data.image}})
 if(!photo||photo.invoiceId||typeof photo.reviewToken!=='string'||!photo.reviewToken) throw fail('Không tạo được phiên ghi nhận công tơ. Hãy chụp lại.',409)
 return {...result,assessment,reviewToken:photo.reviewToken,needsConfirmation:true}
}
