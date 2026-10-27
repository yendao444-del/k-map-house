import { assessReading } from '../../src/meter-policy.mjs'

// Sandbox only. Failure counts and manual confirmations stay in RAM.
export function createManualFallback(contexts) {
 const failures={electric:0,water:0}
 const cameraUnavailable={electric:false,water:false}
 const valid=meter=>['electric','water'].includes(meter)
 return {
  failed(meter){if(valid(meter))failures[meter]++},
  available(){return Object.fromEntries(['electric','water'].map(m=>[m,failures[m]>=2||cameraUnavailable[m]]))},
  confirm({meter,reading,cameraError=false}){
   if(!valid(meter))return {ok:false,reason:'Loại công tơ không hợp lệ.'}
   // A camera error is a declaration by the browser, not photographic evidence.
   if(cameraError)cameraUnavailable[meter]=true
   if(failures[meter]<2&&!cameraUnavailable[meter])return {ok:false,reason:'Hãy thử chụp lại. Nhập thủ công được mở sau 2 lần đọc ảnh thất bại.'}
   const assessment=assessReading(reading,meter,contexts[meter])
   if(assessment.status!=='pass')return {ok:false,assessment,reason:assessment.reason}
   return {ok:true,assessment,source:'manual',confirmationToken:crypto.randomUUID(),reason:''}
  },
  reset(){for(const m of ['electric','water']){failures[m]=0;cameraUnavailable[m]=false}}
 }
}
