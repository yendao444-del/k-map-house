import { funds, parseFmarketNav, type FundNavQuote } from './fund-nav'

type Config = { supabaseUrl: string; anonKey: string }
type Dependencies = { fetch: typeof fetch; now: () => number }
const allowedOrigin = (origin: string) => !origin || ['https://app.phongtroankhang.com','https://ankhanghome-admin-pwa.pages.dev','http://127.0.0.1:4178','http://localhost:4178'].includes(origin) || /^https:\/\/[a-z0-9-]+\.ankhanghome-admin-pwa\.pages\.dev$/.test(origin)
export function createMarketHandler(config: Config, dependencies: Dependencies = { fetch, now: Date.now }) {
  const cache = new Map<string,{ at: number; quote: FundNavQuote }>()
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin') || ''
    const headers = { 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',...(origin && allowedOrigin(origin) ? { 'Access-Control-Allow-Origin':origin } : {}),'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS' }
    const respond = (status: number, body: unknown) => new Response(JSON.stringify(body),{status,headers})
    if (!allowedOrigin(origin)) return respond(403,{ok:false,error:'Origin không được phép.'})
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers})
    if (request.method !== 'POST') return respond(405,{ok:false,error:'Chỉ hỗ trợ POST.'})
    const authorization = request.headers.get('authorization') || ''
    if (!/^Bearer [A-Za-z0-9_.-]{20,16000}$/.test(authorization)) return respond(401,{ok:false,error:'Vui lòng đăng nhập tài khoản quản lý.'})
    try {
      // Validate Auth with Supabase, then re-read the exact active management
      // profile on EVERY call, before using the shared public quote cache.
      const auth = await dependencies.fetch(`${config.supabaseUrl}/auth/v1/user`,{headers:{apikey:config.anonKey,Authorization:authorization},signal:AbortSignal.timeout(10000)})
      if (!auth.ok) return respond(401,{ok:false,error:'Phiên đăng nhập không hợp lệ.'})
      const user = await auth.json()
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user?.id || '')) return respond(401,{ok:false,error:'Không xác định được tài khoản.'})
      const profileResponse = await dependencies.fetch(`${config.supabaseUrl}/rest/v1/users?id=eq.${user.id}&select=id,role,status`,{headers:{apikey:config.anonKey,Authorization:authorization},signal:AbortSignal.timeout(10000)})
      if (!profileResponse.ok) return respond(403,{ok:false,error:'Chưa kiểm tra được quyền quản lý.'})
      const profiles = await profileResponse.json()
      const profile = Array.isArray(profiles) && profiles.length === 1 ? profiles[0] : null
      if (profile?.id !== user.id || profile.status !== 'active' || !['admin','user'].includes(profile.role)) return respond(403,{ok:false,error:'Tài khoản không có quyền quản lý đang hoạt động.'})
      const text = await request.text()
      if (text.length > 2048) return respond(413,{ok:false,error:'Yêu cầu quá lớn.'})
      let payload: { action?: string; symbol?: string }
      try { payload = JSON.parse(text) } catch { return respond(400,{ok:false,error:'Nội dung yêu cầu không hợp lệ.'}) }
      if (!payload || Array.isArray(payload) || payload.action !== 'fund-nav' || typeof payload.symbol !== 'string') return respond(400,{ok:false,error:'Thao tác không hỗ trợ.'})
      const symbol = payload.symbol.trim().toUpperCase()
      if (!funds.has(symbol)) return respond(422,{ok:false,error:`Chưa có nguồn NAV xác thực cho ${symbol.slice(0,12)}. Nhập NAV công bố thực tế.`})
      const cached = cache.get(symbol)
      if (cached && dependencies.now()-cached.at < 300000) return respond(200,{ok:true,data:cached.quote})
      const response = await dependencies.fetch(`https://fmarket.vn/quy/${symbol}`,{headers:{'User-Agent':'Mozilla/5.0 (compatible; AnKhangHome/1.0)'},signal:AbortSignal.timeout(12000)})
      if (!response.ok) return respond(502,{ok:false,error:`Fmarket chưa trả NAV ${symbol} (HTTP ${response.status}).`})
      const html = await response.text()
      if (html.length > 2000000) return respond(502,{ok:false,error:'Nguồn NAV trả nội dung quá lớn.'})
      const quote = parseFmarketNav(html,symbol,dependencies.now())
      cache.set(symbol,{at:dependencies.now(),quote})
      return respond(200,{ok:true,data:quote})
    } catch {
      return respond(502,{ok:false,error:'Chưa tải được NAV xác thực. Nhập NAV công bố thực tế; không dùng giá mô phỏng.'})
    }
  }
}
