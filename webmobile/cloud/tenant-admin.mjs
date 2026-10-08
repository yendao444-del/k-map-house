const fail=(message,status=400)=>Object.assign(new Error(message),{status})
export function tenantAdminHandler(env,fetcher=fetch) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}
  const reply=(status,data)=>Response.json(data,{status,headers:{...cors,'Cache-Control':'no-store'}})
  async function api(route,options={},token=env.SUPABASE_SERVICE_ROLE_KEY) {
    const response=await fetcher(`${env.SUPABASE_URL}${route}`,{...options,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(route.startsWith('/rest/')&&env.CONTRACT_DB_SCHEMA?{'Accept-Profile':env.CONTRACT_DB_SCHEMA,'Content-Profile':env.CONTRACT_DB_SCHEMA}:{}),...options.headers},signal:AbortSignal.timeout(15000)})
    const data=await response.json().catch(()=>null)
    return {response,data}
  }
  const post=data=>({method:'POST',body:JSON.stringify(data)})
  const passwordValid=value=>typeof value==='string'&&value.length>=10&&value.length<=128
  const rowPath=id=>`/rest/v1/tenant_web_accounts?tenant_id=eq.${encodeURIComponent(id)}`
  async function revoke(tenantId,status=null) {
    const result=await api('/rest/v1/rpc/webmobile_revoke_tenant',post({p_tenant_id:tenantId,p_status:status}))
    if(!result.response.ok)throw fail('Chưa thu hồi được phiên đăng nhập. Hãy thử lại.',503)
  }
  return async request=>{
    if(request.method==='OPTIONS')return new Response('ok',{headers:cors})
    if(request.method!=='POST')return reply(405,{ok:false,error:'Yêu cầu không hợp lệ.'})
    let createdId
    try {
      const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')
      if(!token)throw fail('Bạn cần đăng nhập Electron.',401)
      const caller=await api('/auth/v1/user',{},token)
      if(!caller.response.ok||!caller.data?.id)throw fail('Phiên Electron đã hết hạn.',401)
      const permission=await api(`/rest/v1/users?id=eq.${caller.data.id}&select=role,status`)
      if(!permission.response.ok||permission.data?.[0]?.role!=='admin'||permission.data[0].status!=='active')throw fail('Chỉ quản trị viên được quản lý tài khoản website.',403)
      if(!request.headers.get('content-type')?.startsWith('application/json'))throw fail('Yêu cầu không hợp lệ.',415)
      const text=await request.text()
      if(text.length>4096)throw fail('Yêu cầu quá lớn.',413)
      const data=JSON.parse(text)
      const tenantId=data.tenantId
      if(typeof tenantId!=='string'||tenantId.length>128||!/^[\w-]+$/.test(tenantId))throw fail('Khách thuê không hợp lệ.')
      const found=await api(`${rowPath(tenantId)}&select=*`)
      if(!found.response.ok)throw fail('Chưa đọc được tài khoản website.',503)
      const account=found.data?.[0]
      if(data.action==='create') {
        if(account)throw fail('Khách này đã có tài khoản website.',409)
        if(!passwordValid(data.password))throw fail('Mật khẩu cần từ 10 đến 128 ký tự.')
        const tenant=await api(`/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=id,full_name,email,is_active`)
        if(!tenant.response.ok)throw fail('Chưa đọc được hồ sơ khách thuê.',503)
        const info=tenant.data?.[0],email=info?.email?.trim().toLowerCase()
        if(!info||!info.is_active)throw fail('Cần hồ sơ khách thuê đang hoạt động.')
        if(!email||!/^\S+@\S+\.\S+$/.test(email))throw fail('Bổ sung email hợp lệ trong hồ sơ khách trước khi cấp tài khoản.')
        const checked=await api('/rest/v1/rpc/tenant_system_email_conflict',post({p_email:email}))
        if(!checked.response.ok)throw fail('Chưa kiểm tra được email tài khoản hệ thống. Hãy thử lại.',503)
        if(checked.data===true)throw fail('Email này thuộc tài khoản hệ thống. Hãy dùng email riêng của người thuê.',409)
        const reservedId=crypto.randomUUID()
        const reserved=await api('/rest/v1/rpc/webmobile_prepare_tenant_auth',post({p_user:reservedId,p_tenant:tenantId,p_email:email,p_actor:caller.data.id}))
        if(!reserved.response.ok)throw fail('Chưa chuẩn bị được tài khoản khách thuê. Hãy thử lại.',503)
        const created=await api('/auth/v1/admin/users',post({id:reservedId,email,password:data.password,email_confirm:true,role:'anon',app_metadata:{portal_role:'webmobile_tenant'},user_metadata:{full_name:info.full_name,username:`portal_${reservedId.replaceAll('-','')}`}}))
        if(!created.response.ok||!created.data?.id)throw fail(created.response.status===422?'Email này đã có tài khoản. Vui lòng kiểm tra lại hồ sơ.':'Chưa tạo được tài khoản Supabase. Hãy thử lại.',created.response.status===422?409:503)
        createdId=created.data.id
        const enrolled=await api('/rest/v1/rpc/webmobile_enroll_tenant',post({p_user_id:createdId,p_tenant_id:tenantId,p_email:email,p_actor:caller.data.id}))
        if(!enrolled.response.ok)throw fail('Chưa gắn được tài khoản với khách thuê. Vui lòng thử lại.',409)
        createdId=null
      } else {
        if(!account)throw fail('Khách này chưa được cấp tài khoản website.',404)
        if(data.action==='reset_password') {
          if(!passwordValid(data.password))throw fail('Mật khẩu cần từ 10 đến 128 ký tự.')
          const updated=await api(`/auth/v1/admin/users/${account.auth_user_id}`,{method:'PUT',body:JSON.stringify({password:data.password})})
          if(!updated.response.ok)throw fail('Chưa đặt lại được mật khẩu.',503)
          await revoke(tenantId)
        } else if(data.action==='lock'||data.action==='unlock') {
          await revoke(tenantId,data.action)
        } else if(data.action==='revoke_sessions')await revoke(tenantId)
        else throw fail('Thao tác không được hỗ trợ.')
      }
      const current=await api(`${rowPath(tenantId)}&select=*`)
      if(!current.response.ok)throw fail('Thao tác đã xử lý nhưng chưa tải lại được trạng thái. Hãy làm mới danh sách.',503)
      return reply(200,{ok:true,account:current.data?.[0]})
    } catch(cause) {
      if(createdId)await api(`/auth/v1/admin/users/${createdId}`,{method:'DELETE'}).catch(()=>{})
      return reply(cause.status||503,{ok:false,error:cause.status?cause.message:'Dịch vụ tài khoản chưa phản hồi. Hãy thử lại.'})
    }
  }
}
