// Development only. All reads/writes are synthetic; external requests blocked.
if (!import.meta.env.DEV) throw new Error('Development only')
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AssetsTab } from '../../src/renderer/src/components/AssetsTab'
import { TerminateContractModal } from '../../src/renderer/src/components/TerminateContractModal'
import { supabase } from '../../src/renderer/src/lib/supabase'
import '../../src/renderer/src/assets/main.css'
import '../../src/renderer/src/components/account-profile.css'
const params=new URLSearchParams(location.search)
const room={id:'fixture-room',name:'Phòng Demo',status:'ending',default_deposit:3500000,electric_new:10,water_new:2,base_rent:1000000,tenant_id:'fixture-tenant'} as any
const contract={id:'fixture-contract',room_id:room.id,tenant_id:'fixture-tenant',status:'active',created_at:'2026-01-01T00:00:00Z',move_in_date:'2026-01-01',base_rent:1000000,deposit_amount:3500000} as any
const assets=[{id:'fixture-light',room_id:room.id,name:'Bóng đèn',quantity:1},{id:'fixture-toilet',room_id:room.id,name:'Thiết bị vệ sinh',quantity:1}]
const snapshots:any[]=assets.map(a=>({id:'in-'+a.id,room_id:room.id,room_asset_id:a.id,contract_id:contract.id,type:'move_in',condition:'new',recorded_at:'2026-01-02T00:00:00Z'}))
if(params.has('settlement')) snapshots.push(...assets.map(a=>({...snapshots[0],id:'out-'+a.id,room_asset_id:a.id,type:'move_out'})),...['__check_cleared','__check_cleaned','__check_keys'].map(note=>({...snapshots[0],id:note,type:'handover',note,condition:'ok'})))
let inserts=0,proofs=0,recent=params.has('recent'),rejected=false
const stats=()=>{document.getElementById('qa-counts')!.textContent=JSON.stringify({inserts,proofs,recent,rejected})}
const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity,refetchOnMount:false,refetchOnWindowFocus:false},mutations:{retry:false}}})
for(const [key,data] of [
  [['rooms'],[room]],[['allRoomAssets'],assets],[['room_assets',room.id],assets],
  [['asset_snapshots','room-list-move-in',[room.id]],snapshots.filter(s=>s.type==='move_in')],
  ...['move_in','move_out','handover'].map(type=>[['asset_snapshots',room.id,type],snapshots.filter(s=>s.type===type)]),
  [['contracts'],[contract]],[['invoices',room.id],[]],[['serviceZones'],[]]
] as any) client.setQueryData(key,data)
supabase.auth.getSession=async()=>({data:{session:{access_token:'fixture-token'}} as any,error:null})
supabase.from=((table:string)=>{
  const filters:Record<string,unknown>={},builder:any={}; let payload:any
  for(const name of ['select','order','limit','range','in','neq']) builder[name]=()=>builder
  builder.eq=(key:string,value:unknown)=>{filters[key]=value;return builder}
  builder.insert=(data:any)=>{if(!recent)throw Error('Write before password proof');inserts++;stats();payload=data;return builder}
  const result=()=>{
    let data:any=table==='contracts'?[contract]:table==='rooms'?[room]:table==='room_assets'?assets:table==='asset_snapshots'?snapshots:[]
    if(payload){if(params.has('save-fail')){rejected=true;stats();return {data:null,error:{message:'Management MFA/session verification required'}}} data=payload;snapshots.push(...(Array.isArray(payload)?payload:[payload]))}
    data=data.filter((row:any)=>Object.entries(filters).every(([k,v])=>row[k]===v));return {data,error:null}
  }
  builder.then=(resolve:any,reject:any)=>Promise.resolve(result()).then(resolve,reject)
  builder.maybeSingle=builder.single=async()=>{const value=result();return {...value,data:value.data?.[0]||null}}
  return builder
}) as any
supabase.rpc=async()=>{throw Error('Unexpected fixture RPC')}
window.fetch=async(_input,init)=>{
  const body=JSON.parse(String(init?.body||'{}'))
  if(body.security_action==='password_status')return Response.json(params.has('expired')?{ok:false,error:'Phiên bảo mật đã hết hạn. Vui lòng đăng nhập lại.'}:{ok:true,recent_password:recent},{status:params.has('expired')?403:200})
  if(body.security_action==='password_confirm'){
    const valid=body.data.password==='fixture-password';if(valid){proofs++;recent=true;stats()}
    return Response.json(valid?{ok:true}:{ok:false,error:'Mật khẩu hiện tại không đúng.'},{status:valid?200:401})
  }
  throw Error('External request blocked in checkout fixture')
}
function QA(){return <main style={{height:'100dvh',display:'flex'}}>
  {params.has('settlement')?<TerminateContractModal room={room} onClose={()=>{}}/>:<AssetsTab initialRoomId={room.id}/>}
  <output id="qa-counts" style={{position:'fixed',bottom:0,left:0,zIndex:6000,background:'white',fontSize:11}}>{JSON.stringify({inserts,proofs,recent,rejected})}</output>
</main>}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><QA/></QueryClientProvider>)
