import { app, ipcMain, safeStorage, shell } from 'electron'
import { createServer, type Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { notificationEmailIcons } from '../shared/notification-email-assets'
import { contractEmailAssets } from '../shared/contract-email-assets'

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email'
const REDIRECT_URI = 'http://localhost:3456/callback'
const OTHER_APP_USER_DATA = 'quan-ly-ban-hang-desktop'

type GmailResult = { ok: boolean; error?: string; reauthRequired?: boolean; notSent?: boolean; messageId?: string }

function configuredSender(): string {
  const sender = process.env.KMAP_CONTRACT_TEST === '1'
    ? process.env.CONTRACT_TEST_GMAIL_SENDER
    : process.env.GMAIL_SENDER_EMAIL || process.env.CONTRACT_TEST_GMAIL_SENDER
  return String(sender || '').trim().toLowerCase()
}

export function gmailSendFailure(error: unknown): GmailResult {
  const detail = error as { response?: { status?: number }; code?: number; message?: string }
  const message = String(detail?.message || 'Gửi Gmail thất bại.')
  const status = Number(detail?.response?.status || detail?.code)
  // A provider rejection means no message was accepted. Network failures and
  // server errors stay uncertain so the contract cannot accidentally send twice.
  const notSent = [400, 401, 403, 404].includes(status) || /Project #\d+ has been deleted|invalid_grant|invalid_client|deleted_client|Thiếu cấu hình Google OAuth/i.test(message)
  if (/Project #\d+ has been deleted|deleted_client/i.test(message)) return {
    ok: false, notSent: true,
    error: 'Google Cloud project dùng để gửi Gmail đã bị xóa. Thư chưa được gửi. Cần thay cấu hình Google OAuth bằng project còn hoạt động rồi kết nối Gmail lại.'
  }
  if (status === 401 || /invalid_grant|unauthorized/i.test(message)) return {
    ok: false, notSent: true, reauthRequired: true,
    error: 'Phiên Gmail đã hết hạn hoặc bị thu hồi. Hãy kết nối Gmail lại.'
  }
  return { ok: false, notSent, error: message }
}

export function buildGmailRawMessage(payload: {
  to: string
  subject: string
  html: string
}): string {
  // MIME body charset does not apply to headers. Encode the subject as RFC 2047
  // words, splitting at Unicode boundaries to stay below the 75-character limit.
  const words: string[] = []
  let chunk = ''
  for (const char of payload.subject.replace(/[\r\n]+/g, ' ')) {
    if (Buffer.byteLength(chunk + char, 'utf8') > 42) {
      words.push(`=?UTF-8?B?${Buffer.from(chunk, 'utf8').toString('base64')}?=`)
      chunk = ''
    }
    chunk += char
  }
  if (chunk) words.push(`=?UTF-8?B?${Buffer.from(chunk, 'utf8').toString('base64')}?=`)
  const fold = (value: string): string => value.match(/.{1,76}/g)?.join('\r\n') || ''
  const headers = [`To: ${payload.to}`, `Subject: ${words.join('\r\n ')}`, 'MIME-Version: 1.0']
  const htmlBody = fold(Buffer.from(payload.html || '', 'utf8').toString('base64'))
  let parts: string[]
  const icons = Object.entries({ ...notificationEmailIcons, ...contractEmailAssets }).filter(([, icon]) =>
    payload.html.includes(`cid:${icon.cid}`)
  )
  if (icons.length) {
    // Gmail does not render data URLs in emails. Ship the approved icon as a CID part.
    const boundary = `payment_${randomBytes(16).toString('hex')}`
    parts = [
      `Content-Type: multipart/related; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      htmlBody,
      ...icons.flatMap(([tone, icon]) => [
        `--${boundary}`,
        'Content-Type: image/png',
        'Content-Transfer-Encoding: base64',
        `Content-ID: <${icon.cid}>`,
        `Content-Disposition: inline; filename="email-${tone}.png"`,
        '',
        fold(icon.base64)
      ]),
      `--${boundary}--`
    ]
  } else {
    parts = [
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      htmlBody
    ]
  }
  const raw = [...headers, ...parts].join('\r\n')
  return Buffer.from(raw, 'utf8').toString('base64url')
}

async function oauthClient(): Promise<
  InstanceType<typeof import('googleapis').google.auth.OAuth2>
> {
  const clientId = String(process.env.DEV_GMAIL_CLIENT_ID || '').trim()
  const clientSecret = String(process.env.DEV_GMAIL_CLIENT_SECRET || '').trim()
  if (!clientId || !clientSecret) throw new Error('Thiếu cấu hình Google OAuth cho Gmail.')
  const { google } = await import('googleapis')
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
}

function currentTokenPath(): string {
  return join(app.getPath('userData'), 'dev-gmail-token.bin')
}
function sourceTokenPaths(): string[] {
  const appData = app.getPath('appData')
  return [
    join(appData, OTHER_APP_USER_DATA, 'gdrive-token.bin'),
    join(appData, OTHER_APP_USER_DATA, 'gdrive-token.json')
  ]
}

function readTokenFile(path: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(path)
    const text = path.endsWith('.bin') ? safeStorage.decryptString(raw) : raw.toString('utf8')
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
}

function readToken(): Record<string, unknown> | null {
  const own = currentTokenPath()
  if (existsSync(own)) {
    const token = readTokenFile(own)
    if (token?.gmail_client_id && token.gmail_client_id !== process.env.DEV_GMAIL_CLIENT_ID?.trim()) return null
    if (configuredSender() && (token?.gmail_client_id !== process.env.DEV_GMAIL_CLIENT_ID?.trim() || token?.gmail_sender_email !== configuredSender())) return null
    // TEST must reconnect after changing OAuth config; never reuse an unbound
    // legacy token from the deleted Google project.
    if (process.env.KMAP_CONTRACT_TEST === '1' && !token?.gmail_client_id) return null
    return token
  }
  if (process.env.KMAP_CONTRACT_TEST === '1' || configuredSender()) return null
  for (const path of sourceTokenPaths()) if (existsSync(path)) return readTokenFile(path)
  return null
}

function saveToken(token: Record<string, unknown>): void {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('Windows safeStorage chưa sẵn sàng để lưu phiên Gmail.')
  const path = currentTokenPath()
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(path, safeStorage.encryptString(JSON.stringify({ ...token, gmail_client_id: process.env.DEV_GMAIL_CLIENT_ID?.trim() })), { mode: 0o600 })
}

function hasScope(token: Record<string, unknown> | null): boolean {
  return String(token?.scope || '')
    .split(/\s+/)
    .includes(GMAIL_SCOPE)
}

let pendingOAuth: Promise<GmailResult> | null = null

export function startDevGmailOAuth(options: { openBrowser?: boolean } = {}): Promise<GmailResult> {
  if (pendingOAuth) return pendingOAuth
  const current = startOAuth(options).catch(error => ({ ok: false, error: error instanceof Error ? error.message : 'Không mở được xác thực Gmail.' }))
  pendingOAuth = current
  void current.then(() => { if (pendingOAuth === current) pendingOAuth = null })
  return current
}

async function startOAuth(options: { openBrowser?: boolean }): Promise<GmailResult> {
  const client = await oauthClient()
  const state = randomBytes(24).toString('hex')
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'select_account consent',
    state,
    scope: configuredSender() ? [GMAIL_SCOPE, 'openid', EMAIL_SCOPE] : [GMAIL_SCOPE],
    ...(configuredSender() ? { login_hint: configuredSender() } : {})
  })
  return new Promise((resolve) => {
    let server: Server | null = null
    let finished = false
    let exchanging = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const finish = (result: GmailResult): void => {
      if (finished) return
      finished = true
      if (timeout) clearTimeout(timeout)
      app.removeListener('before-quit', cancel)
      if (server) server.close()
      resolve(result)
    }
    const cancel = (): void => finish({ ok: false, error: 'Đã đóng phiên xác thực Gmail.' })
    app.once('before-quit', cancel)
    server = createServer(async (request, response) => {
      const url = new URL(request.url || '/', REDIRECT_URI)
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('Referrer-Policy', 'no-referrer')
      if (request.method === 'GET' && url.pathname === '/authorize') {
        // This loopback URL lets the active Electron OAuth session continue in
        // another browser without exposing its token or creating another flow.
        response.writeHead(302, { Location: authUrl })
        response.end()
        return
      }
      if (url.pathname !== '/callback') {
        response.writeHead(404)
        response.end()
        return
      }
      if (url.searchParams.get('state') !== state) {
        response.writeHead(400)
        response.end('Phiên xác thực không hợp lệ.')
        return
      }
      if (url.searchParams.has('error')) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('Bạn chưa cấp quyền gửi Gmail. Có thể kết nối lại từ Electron.')
        finish({ ok: false, error: 'Chưa được cấp quyền gửi Gmail. Bấm Kết nối Gmail để thử lại.' })
        return
      }
      if (exchanging || finished) {
        response.writeHead(409)
        response.end('Phiên này đang được xử lý.')
        return
      }
      const code = url.searchParams.get('code')
      if (!code) {
        response.writeHead(400)
        response.end('Thiếu mã xác thực.')
        finish({ ok: false, error: 'Google không trả mã xác thực.' })
        return
      }
      exchanging = true
      try {
        const { tokens } = await client.getToken(code)
        let sender = ''
        if (configuredSender()) {
          if (!tokens.id_token) throw new Error('Google chưa trả danh tính Gmail. Hãy kết nối lại.')
          const identity = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.DEV_GMAIL_CLIENT_ID?.trim() })
          const profile = identity.getPayload()
          sender = String(profile?.email || '').toLowerCase()
          if (!profile?.email_verified || sender !== configuredSender()) throw new Error(`Bạn đã chọn Gmail khác. Hãy chọn ${configuredSender()} để gửi thư phòng trọ.`)
        }
        saveToken({ ...tokens, ...(sender ? { gmail_sender_email: sender } : {}) } as Record<string, unknown>)
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end('<h2>Xác thực Gmail thành công. Bạn có thể đóng cửa sổ này.</h2>')
        finish({ ok: true })
      } catch (error) {
        response.writeHead(500)
        response.end('Xác thực Gmail thất bại.')
        finish({
          ok: false,
          error: error instanceof Error ? error.message : 'Xác thực Gmail thất bại.'
        })
      }
    })
    server.once('error', () =>
      finish({ ok: false, error: 'Cổng xác thực Gmail 3456 đang được sử dụng.' })
    )
    server.listen(3456, '127.0.0.1', () => {
      if (options.openBrowser !== false) void shell.openExternal(authUrl).catch(() => finish({ ok: false, error: 'Không mở được trình duyệt xác thực Gmail.' }))
    })
    timeout = setTimeout(() => finish({ ok: false, error: 'Hết thời gian chờ đăng nhập Google. Bấm Kết nối Gmail để tạo phiên mới.' }), 600_000)
  })
}

async function send(payload: { to: string; subject: string; html: string }): Promise<GmailResult> {
  let token = readToken()
  if (!token || !hasScope(token))
    return {
      ok: false,
      reauthRequired: true,
      notSent: true,
      error: configuredSender() ? `Chưa kết nối Gmail ${configuredSender()} với quyền gửi thư.` : 'Chưa đăng nhập Gmail với quyền gửi thư.'
    }
  try {
    const client = await oauthClient()
    const { google } = await import('googleapis')
    client.setCredentials(token)
    client.on('tokens', (tokens) => {
      try {
        saveToken({ ...token, ...tokens })
        token = { ...token, ...tokens }
      } catch {
        /* keep current access token */
      }
    })
    const raw = buildGmailRawMessage(payload)
    const result = await google
      .gmail({ version: 'v1', auth: client })
      .users.messages.send({ userId: 'me', requestBody: { raw } })
    return { ok: true, messageId: result.data.id || undefined }
  } catch (error) {
    return gmailSendFailure(error)
  }
}

export function registerDevGmailHandlers(): void {
  ipcMain.removeHandler('gmail:getAvailability')
  ipcMain.removeHandler('gmail:reauthenticate')
  ipcMain.removeHandler('gmail:sendNotification')
  ipcMain.handle('gmail:getAvailability', () => {
    if (!process.env.DEV_GMAIL_CLIENT_ID || !process.env.DEV_GMAIL_CLIENT_SECRET) return { available: false, reason: 'Chưa có cấu hình Google OAuth cho Gmail. Thiết lập Gmail trước khi gửi hợp đồng.' }
    const token = readToken()
    return { available: true, authenticated: Boolean(token && hasScope(token)), senderEmail: configuredSender() || String(token?.gmail_sender_email || '') }
  })
  ipcMain.handle('gmail:reauthenticate', async () => {
    return startDevGmailOAuth()
  })
  ipcMain.handle('gmail:sendNotification', async (_event, payload) => {
    const recipient = String(payload?.to || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || /[\r\n]/.test(String(payload?.subject || ''))) return { ok: false, error: 'Email hoặc tiêu đề không hợp lệ.' }
    if (process.env.KMAP_CONTRACT_TEST === '1' && !String(process.env.CONTRACT_TEST_EMAIL_ALLOWLIST || '').split(',').map(value => value.trim().toLowerCase()).includes(recipient)) return { ok: false, error: 'Email này chưa được cho phép nhận thư TEST.' }
    return send({
      to: String(payload?.to || ''),
      subject: String(payload?.subject || ''),
      html: String(payload?.html || '')
    })
  })
}
