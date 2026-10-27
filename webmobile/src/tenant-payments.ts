import { requestJson } from './request-json.mjs'
export type TenantInvoice = {id:string;month:number;year:number;invoice_date:string;due_date:string;billing_period_start:string;billing_period_end:string;billing_reason:string;
 total_amount:number;paid_amount:number;remaining:number;payment_status:string;payment_date?:string;
 electric_old:number;electric_new:number;electric_usage:number;electric_cost:number;electric_price_snapshot:number;
 water_old:number;water_new:number;water_usage:number;water_cost:number;water_price_snapshot:number;
 room_cost:number;wifi_cost:number;garbage_cost:number;old_debt:number;merged_debt_total?:number;deposit_amount?:number;deposit_applied?:number;
 damage_amount?:number;adjustment_amount?:number;adjustment_note?:string;has_transfer?:boolean;transfer_room_cost?:number;transfer_electric_cost?:number;transfer_water_cost?:number;transfer_service_cost?:number;
 transferContent:string;qr:string|null}
export type PaymentCycle={id:string;period:string;period_start:string;period_end:string;electric_old:number;water_old:number;electric_new:number|null;water_new:number|null;invoice_id:string|null}
export type TenantPaymentState={cycle:PaymentCycle|null;invoices:TenantInvoice[];bank:{name:string;account:string;owner:string}|null;notices:{invoiceId:string;status:string;amount:number}[];nextDate:string;blockedReason?:string|null;manualFallback?:{electric:boolean;water:boolean}}
export function tenantPaymentApi(action:'state',signal?:AbortSignal):Promise<TenantPaymentState>
export function tenantPaymentApi(action:'create',signal?:AbortSignal):Promise<{ok:true;invoiceId:string}>
export async function tenantPaymentApi(action:'state'|'create',signal?:AbortSignal):Promise<TenantPaymentState|{ok:true;invoiceId:string}> {
 const {response,data}=await requestJson('/api/tenant-payments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action}),signal},18000)
 if([401,403].includes(response.status))window.dispatchEvent(new Event('webmobile:unauthorized'))
 if(!response.ok||!data?.ok)throw new Error(data?.reason||'Chưa cập nhật được thanh toán. Hãy thử lại.')
 if(action==='create'&&(typeof data.invoiceId!=='string'||!data.invoiceId))throw new Error('Chưa nhận được hóa đơn. Hãy thử lại.')
 return data
}

// This endpoint exists only in the Room 999 memory-only server.
export async function sandboxPaymentApi(invoiceId:string,signal?:AbortSignal):Promise<void> {
 const {response,data}=await requestJson('/api/sandbox-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invoiceId}),signal},15000)
 if(!response.ok||!data?.ok)throw new Error(data?.reason||'Chưa ghi nhận được thanh toán kiểm nghiệm.')
}

// This endpoint exists only in the Room 999 memory-only server.
export async function sandboxResetApi(signal?:AbortSignal):Promise<void> {
 const {response,data}=await requestJson('/api/sandbox-reset',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal},15000)
 if(!response.ok||!data?.ok)throw new Error(data?.reason||'Chưa tạo lại được kỳ kiểm nghiệm.')
}
