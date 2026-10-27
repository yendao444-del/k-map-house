import { identifier, PaymentValidationError, verifyProviderTransaction } from './policy'
type Config = { supabaseUrl: string; anonKey: string; serviceKey: string }
type Dependencies = { fetch: typeof fetch; now: () => number }
const permittedOrigin = (origin: string) => !origin || ['https://app.phongtroankhang.com','https://ankhanghome-admin-pwa.pages.dev','http://127.0.0.1:4178','http://localhost:4178'].includes(origin) || /^https:\/\/[a-z0-9-]+\.ankhanghome-admin-pwa\.pages\.dev$/.test(origin)
const maskAccount = (value: unknown): string => {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return ''
  const visible = text.slice(-4)
  return `${'•'.repeat(Math.min(8, Math.max(4, text.length - visible.length)))}${visible}`
}
const sanitizeTransaction = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const tx = value as Record<string, unknown>
  const id = typeof tx.id === 'string' ? tx.id.trim() : ''
  const amount = Number(tx.amount_in)
  if (!identifier(id) || !Number.isSafeInteger(amount) || amount <= 0 || amount > 2147483647) return null
  return {
    id,
    amount_in: String(amount),
    transaction_content: typeof tx.transaction_content === 'string' ? tx.transaction_content.slice(0, 4000) : '',
    transaction_date: typeof tx.transaction_date === 'string' ? tx.transaction_date.slice(0, 64) : '',
    bank_brand_name: typeof tx.bank_brand_name === 'string' ? tx.bank_brand_name.slice(0, 120) : '',
    account_name: typeof tx.account_name === 'string' ? tx.account_name.slice(0, 160) : '',
    account_number: maskAccount(tx.account_number),
    sub_account: maskAccount(tx.sub_account),
    reference_number: typeof tx.reference_number === 'string' ? tx.reference_number.slice(0, 128) : ''
  }
}
export function createSepayHandler(config: Config, deps: Dependencies = { fetch, now: Date.now }) {
  const dbHeaders = { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, 'Content-Type':'application/json' }
  const db = (path: string, options: RequestInit = {}) => deps.fetch(`${config.supabaseUrl}/rest/v1/${path}`, { ...options, headers: dbHeaders, signal: AbortSignal.timeout(12000) })
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin') || ''
    const headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin', ...(origin && permittedOrigin(origin) ? {'Access-Control-Allow-Origin':origin} : {}), 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods':'POST,OPTIONS' }
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body),{status,headers})
    if (!permittedOrigin(origin)) return reply(403,{ok:false,error:'Origin không được phép.'})
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers})
    if (request.method !== 'POST') return reply(405,{ok:false,error:'Chỉ hỗ trợ POST.'})
    const authorization = request.headers.get('authorization') || ''
    if (!/^Bearer [A-Za-z0-9_.-]{20,16000}$/.test(authorization)) return reply(401,{ok:false,error:'Vui lòng đăng nhập quản trị viên.'})
    try {
      const auth = await deps.fetch(`${config.supabaseUrl}/auth/v1/user`,{headers:{apikey:config.anonKey,Authorization:authorization},signal:AbortSignal.timeout(10000)})
      const user = auth.ok ? await auth.json() : null
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user?.id || '')) return reply(401,{ok:false,error:'Phiên đăng nhập không hợp lệ.'})
      const text = await request.text()
      if (text.length > 2048) return reply(413,{ok:false,error:'Yêu cầu vượt giới hạn.'})
      let payload: Record<string, unknown>
      try { payload = JSON.parse(text) } catch { return reply(400,{ok:false,error:'Yêu cầu không hợp lệ.'}) }
      const action = String(payload?.action || '')
      const isList = action === 'list'
      const isInvoice = action === 'reconcile' || action === 'suggested-reconcile'
      const validRequest = payload && !Array.isArray(payload) && Object.keys(payload).every(key => ['action','transactionId','invoiceId'].includes(key)) && ['list','reconcile','suggested-reconcile','bank-receipt'].includes(action) && (isList ? payload.transactionId === undefined && payload.invoiceId === undefined : identifier(payload.transactionId) && (isInvoice ? identifier(payload.invoiceId) : payload.invoiceId === undefined))
      if (!validRequest) return reply(400,{ok:false,error:'Chỉ gửi mã giao dịch và hóa đơn; không gửi số tiền hoặc tài khoản nhận.'})
      // Check the caller's session before any privileged service-role reads.
      // GET keeps the read-only check out of the pre-request write recency gate.
      // Reconciliation passes true and requires recent MFA or password confirmation.
      const securityResponse = await deps.fetch(`${config.supabaseUrl}/rest/v1/rpc/security_management_access_allowed?p_sensitive=${!isList}`, {
        method: 'GET', headers: { apikey: config.anonKey, Authorization: authorization },
        signal: AbortSignal.timeout(10000)
      })
      if (!securityResponse.ok) return reply(securityResponse.status === 401 || securityResponse.status === 403 ? securityResponse.status : 503,{ok:false,error:securityResponse.status === 401 || securityResponse.status === 403
        ? 'Phiên bảo mật chưa hoàn tất hoặc đã hết hạn. Vui lòng kiểm tra lại trong Hồ sơ → Bảo mật.'
        : 'Chưa kiểm tra được phiên bảo mật tại máy chủ. Vui lòng thử lại sau.'})
      if (await securityResponse.json() !== true) return reply(403,{ok:false,error:isList
        ? 'Phiên bảo mật chưa hoàn tất hoặc đã hết hạn. Vui lòng kiểm tra lại trong Hồ sơ → Bảo mật.'
        : 'Thao tác này cần xác nhận mật khẩu hiện tại. Hãy nhập mật khẩu tại thao tác đang thực hiện rồi thử lại.'})
      const profileResponse = await db(`users?id=eq.${user.id}&select=id,role,status`)
      const profiles = profileResponse.ok ? await profileResponse.json() : null
      if (!Array.isArray(profiles) || profiles.length !== 1 || profiles[0].id !== user.id || profiles[0].role !== 'admin' || profiles[0].status !== 'active') return reply(403,{ok:false,error:'Chỉ admin đang hoạt động được đối soát ngân hàng.'})
      const [secretResponse, settingsResponse] = await Promise.all([db('app_secrets?id=eq.default&select=sepay_api_token'),db('app_settings?select=account_no&limit=2')])
      const secrets = secretResponse.ok ? await secretResponse.json() : null
      const settings = settingsResponse.ok ? await settingsResponse.json() : null
      const token = Array.isArray(secrets) && secrets.length === 1 && typeof secrets[0].sepay_api_token === 'string' ? secrets[0].sepay_api_token.trim() : ''
      if (!token || !Array.isArray(settings) || settings.length !== 1 || !settings[0].account_no) return reply(503,{ok:false,error:'Chưa có cấu hình SePay/tài khoản nhận tiền duy nhất ở máy chủ.'})
      // Fixed, existing READ-ONLY provider endpoint. No client URL, bank action,
      // bearer override, amount, account or fabricated transaction is accepted.
      const source = await deps.fetch('https://my.sepay.vn/userapi/transactions/list',{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(12000)})
      if (!source.ok) return reply(502,{ok:false,error:'Chưa xác minh được giao dịch trực tiếp với SePay. Chưa ghi nhận tiền.'})
      const raw = await source.text()
      if (raw.length > 4000000) return reply(502,{ok:false,error:'Nguồn SePay vượt giới hạn. Chưa ghi nhận tiền.'})
      const provider = JSON.parse(raw)
      if (Number(provider?.status) !== 200 || !Array.isArray(provider.transactions)) return reply(502,{ok:false,error:'Nguồn SePay không hợp lệ. Chưa ghi nhận tiền.'})
      if (isList) {
        const transactions = provider.transactions.map(sanitizeTransaction).filter(Boolean).slice(0, 500)
        const verified = []
        const diagnostics: Record<string, unknown> = {}
        for (const tx of provider.transactions.slice(0,500)) {
          try { verified.push(verifyProviderTransaction(tx,String(tx.id),settings[0].account_no,deps.now())) }
          catch { if (tx?.id) diagnostics[String(tx.id)] = { status:'invalid' } }
        }
        let suggestions: unknown = {}
        try {
          const suggestionResponse = await db('rpc/admin_pwa_sepay_suggestions',{method:'POST',body:JSON.stringify({p_transactions:verified})})
          suggestions = suggestionResponse.ok ? await suggestionResponse.json() : {}
        } catch { suggestions = {} }
        if (!suggestions || typeof suggestions !== 'object' || Array.isArray(suggestions)) return reply(200,{ok:true,data:{status:200,transactions}})
        return reply(200,{ok:true,data:{status:200,transactions:transactions.map((tx: Record<string,unknown>) => ({...tx,reconciliation:diagnostics[String(tx.id)] || suggestions[String(tx.id)] || {status:'invalid'}}))}})
      }
      const candidates = provider.transactions.filter((tx: unknown) => tx && typeof tx === 'object' && String((tx as Record<string,unknown>).id) === payload.transactionId)
      if (candidates.length !== 1) return reply(candidates.length ? 409 : 404,{ok:false,error:'Chưa tìm thấy giao dịch duy nhất trong lịch sử SePay hiện có. Tải lại đối soát; không ghi tiền từ dữ liệu phía điện thoại.'})
      const verified = verifyProviderTransaction(candidates[0],payload.transactionId,settings[0].account_no,deps.now())
      const resultResponse = await db('rpc/admin_pwa_reconcile_verified_sepay',{method:'POST',body:JSON.stringify({p_tx:verified,p_invoice_id:payload.invoiceId || null,p_actor:user.id,p_mode:payload.action})})
      const result = await resultResponse.json()
      if (!resultResponse.ok) return reply(resultResponse.status === 401 || resultResponse.status === 403 ? 403 : 409,{ok:false,error:'Máy chủ từ chối đối soát: số tiền, hóa đơn, giao dịch trùng hoặc mốc khóa sổ không phù hợp. Tải lại dữ liệu trước khi xử lý tiếp.'})
      if (!result || (isInvoice ? !result.invoice : !result.receiptId)) return reply(502,{ok:false,error:'Chưa xác định kết quả đối soát. Tải lại và kiểm tra sổ trước khi thử lại.'})
      return reply(200,{ok:true,data:result})
    } catch (error) {
      if (error instanceof PaymentValidationError) return reply(error.status,{ok:false,error:error.message})
      return reply(502,{ok:false,error:'Chưa xác định kết quả đối soát. Tải lại hóa đơn/sổ ngân hàng trước khi thử lại; không tự ghi bù.'})
    }
  }
}
