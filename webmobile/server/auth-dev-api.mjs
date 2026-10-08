import { cloudHandler } from '../cloud/handler.mjs'
import { readCloudMeter } from '../cloud/online-reader.mjs'

// Use the same Supabase authentication/contract guards as the public site.
// Only localhost cookies differ: they are HttpOnly without the HTTPS-only prefix.
export function authDevApi(env) {
  async function rpc(name, data) {
    const result = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(10000) })
    if (!result.ok) throw new Error('state_unavailable')
    return result.json()
  }
  const handler = cloudHandler({ ...env, WEBMOBILE_AUTH_REQUIRED: 'true' }, rpc, readCloudMeter)
  return { name: 'webmobile-authenticated-local-api', configureServer(server) {
    server.middlewares.use('/api', async (req, res, next) => {
      const endpoint = req.url?.split('?')[0].slice(1)
      if (!['auth','health','meter-ocr','demo-payments'].includes(endpoint)) return next()
      const send = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control','no-store'); res.end(JSON.stringify(body)) }
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403, { ok:false, reason:'Không cho phép truy cập.' })
      if (req.method !== (endpoint === 'health' ? 'GET' : 'POST')) return send(405,{ok:false,reason:'Yêu cầu không hợp lệ.'})
      if (endpoint !== 'health' && !String(req.headers['content-type']).startsWith('application/json')) return send(415,{ok:false,reason:'Yêu cầu không hợp lệ.'})
      try {
        let body = '', bytes = 0
        for await (const chunk of req) { bytes += chunk.length; if(bytes>(endpoint==='meter-ocr'?4_100_000:8192)) return send(413,{ok:false,reason:'Yêu cầu quá lớn.'}); body+=chunk.toString() }
        const cookies=String(req.headers.cookie||'')
        const authId=cookies.match(/(?:^|;\s*)webmobile-auth-local=([a-f0-9-]{36})(?:;|$)/i)?.[1]||''
        const session=cookies.match(/(?:^|;\s*)webmobile-demo-local=([a-f0-9-]{36})(?:;|$)/i)?.[1]||crypto.randomUUID()
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${env.WEBMOBILE_GATEWAY_SECRET}:localhost`))
        const ip=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')
        const request=new Request('http://localhost/backend',{method:req.method,headers:{Authorization:`Bearer ${env.WEBMOBILE_GATEWAY_SECRET}`,'Content-Type':'application/json','x-webmobile-endpoint':endpoint,'x-webmobile-auth-session':authId,'x-webmobile-session':session,'x-webmobile-ip':ip},...(req.method==='POST'?{body}:{})})
        const result=await handler(request),data=await result.json()
        const cookie=(name,value,age=86400)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}`
        let setCookies=[cookie('webmobile-demo-local',session)]
        if(endpoint==='auth') {
          const action=JSON.parse(body).action
          if(result.ok&&action==='login') setCookies=[cookie('webmobile-demo-local',crypto.randomUUID()),cookie('webmobile-auth-local',data.sessionId,604800)]
          else if((result.ok&&action==='logout')||result.status===401) setCookies=[cookie('webmobile-demo-local','',0),cookie('webmobile-auth-local','',0)]
          delete data.sessionId
        }
        res.setHeader('Set-Cookie',setCookies);send(result.status,data)
      } catch { send(503,{ok:false,reason:'Backend chưa phản hồi. Hãy thử lại.'}) }
    })
  } }
}
