import { app, ipcMain, safeStorage, shell } from 'electron'
import { createServer, type Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const REDIRECT_URI = 'http://localhost:3456/callback'
const OTHER_APP_USER_DATA = 'quan-ly-ban-hang-desktop'

type GmailResult = { ok: boolean; error?: string; reauthRequired?: boolean; messageId?: string }

async function oauthClient() {
  const clientId = String(process.env.DEV_GMAIL_CLIENT_ID || '').trim()
  const clientSecret = String(process.env.DEV_GMAIL_CLIENT_SECRET || '').trim()
  if (!clientId || !clientSecret) throw new Error('Thiếu cấu hình Google OAuth cho máy dev.')
  const { google } = await import('googleapis')
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
}

function currentTokenPath(): string { return join(app.getPath('userData'), 'dev-gmail-token.bin') }
function sourceTokenPaths(): string[] {
  const appData = app.getPath('appData')
  return [join(appData, OTHER_APP_USER_DATA, 'gdrive-token.bin'), join(appData, OTHER_APP_USER_DATA, 'gdrive-token.json')]
}

function readTokenFile(path: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(path)
    const text = path.endsWith('.bin') ? safeStorage.decryptString(raw) : raw.toString('utf8')
    return JSON.parse(text) as Record<string, unknown>
  } catch { return null }
}

function readToken(): Record<string, unknown> | null {
  const own = currentTokenPath()
  if (existsSync(own)) return readTokenFile(own)
  for (const path of sourceTokenPaths()) if (existsSync(path)) return readTokenFile(path)
  return null
}

function saveToken(token: Record<string, unknown>): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows safeStorage chưa sẵn sàng để lưu phiên Gmail.')
  const path = currentTokenPath()
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(path, safeStorage.encryptString(JSON.stringify(token)), { mode: 0o600 })
}

function hasScope(token: Record<string, unknown> | null): boolean {
  return String(token?.scope || '').split(/\s+/).includes(GMAIL_SCOPE)
}

async function startOAuth(): Promise<GmailResult> {
  const client = await oauthClient()
  const state = randomBytes(24).toString('hex')
  const authUrl = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', state, scope: [GMAIL_SCOPE] })
  return new Promise((resolve) => {
    let server: Server | null = null
    const finish = (result: GmailResult) => { if (server) server.close(); resolve(result) }
    server = createServer(async (request, response) => {
      const url = new URL(request.url || '/', REDIRECT_URI)
      if (url.pathname !== '/callback') { response.writeHead(404); response.end(); return }
      if (url.searchParams.get('state') !== state) { response.writeHead(400); response.end('Phiên xác thực không hợp lệ.'); finish({ ok: false, error: 'Phiên xác thực Google không hợp lệ.' }); return }
      const code = url.searchParams.get('code')
      if (!code) { response.writeHead(400); response.end('Thiếu mã xác thực.'); finish({ ok: false, error: 'Google không trả mã xác thực.' }); return }
      try {
        const { tokens } = await client.getToken(code)
        saveToken(tokens as Record<string, unknown>)
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end('<h2>Xác thực Gmail thành công. Bạn có thể đóng cửa sổ này.</h2>')
        finish({ ok: true })
      } catch (error) {
        response.writeHead(500); response.end('Xác thực Gmail thất bại.')
        finish({ ok: false, error: error instanceof Error ? error.message : 'Xác thực Gmail thất bại.' })
      }
    })
    server.once('error', () => finish({ ok: false, error: 'Cổng xác thực Gmail 3456 đang được sử dụng.' }))
    server.listen(3456, '127.0.0.1', () => { void shell.openExternal(authUrl) })
    setTimeout(() => finish({ ok: false, error: 'Hết thời gian chờ đăng nhập Google.' }), 180_000)
  })
}

async function send(payload: { to: string; subject: string; html: string }): Promise<GmailResult> {
  let token = readToken()
  if (!token || !hasScope(token)) return { ok: false, reauthRequired: true, error: 'Máy dev chưa đăng nhập Gmail với quyền gửi thư.' }
  const client = await oauthClient()
  const { google } = await import('googleapis')
  client.setCredentials(token)
  client.on('tokens', (tokens) => { try { saveToken({ ...token, ...tokens }); token = { ...token, ...tokens } } catch { /* keep current access token */ } })
  const raw = [`To: ${payload.to}`, `Subject: ${payload.subject}`, 'MIME-Version: 1.0', 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', Buffer.from(payload.html || '', 'utf8').toString('base64')].join('\r\n')
  try {
    const result = await google.gmail({ version: 'v1', auth: client }).users.messages.send({ userId: 'me', requestBody: { raw: Buffer.from(raw).toString('base64url') } })
    return { ok: true, messageId: result.data.id || undefined }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gửi Gmail thất bại.'
    if (/invalid_grant|unauthorized|401|403/i.test(message)) return { ok: false, reauthRequired: true, error: 'Phiên Gmail đã hết hạn hoặc bị thu hồi. Hãy đăng nhập Gmail lại trên máy dev.' }
    return { ok: false, error: message }
  }
}

export function registerDevGmailHandlers(): void {
  ipcMain.removeHandler('gmail:getAvailability')
  ipcMain.removeHandler('gmail:reauthenticate')
  ipcMain.removeHandler('gmail:sendNotification')
  ipcMain.handle('gmail:getAvailability', () => {
    if (app.isPackaged) return { available: false, reason: 'Chỉ máy dev mới được gửi Gmail.' }
    const token = readToken()
    return { available: true, authenticated: Boolean(token && hasScope(token)) }
  })
  ipcMain.handle('gmail:reauthenticate', async () => {
    if (app.isPackaged) return { ok: false, error: 'Chỉ máy dev mới được xác thực Gmail.' }
    return startOAuth()
  })
  ipcMain.handle('gmail:sendNotification', async (_event, payload) => {
    if (app.isPackaged) return { ok: false, error: 'Gửi Gmail chỉ được bật trên máy dev.' }
    return send({ to: String(payload?.to || ''), subject: String(payload?.subject || ''), html: String(payload?.html || '') })
  })
}
