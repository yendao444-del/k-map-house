const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

const assets = {}
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/shared/payment-email-assets.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText)(assets)
const notificationAssets = {}
new Function('require', 'exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/shared/notification-email-assets.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText)(() => assets, notificationAssets)
const contractTemplate = {}
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/shared/contract-email-template.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText)(contractTemplate)
const contractAssets = {}
new Function('require', 'exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/shared/contract-email-assets.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText)(() => contractTemplate, contractAssets)

function harness(options = {}) {
  const handlers = new Map()
  const requests = []
  const oauth = { created: 0, closes: 0, saved: [], options: null, handler: null }
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/main/gmail-dev.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  vm.runInNewContext(code, {
    exports, Buffer, URL, setTimeout, clearTimeout,
    process: { env: { DEV_GMAIL_CLIENT_ID: 'mock-id', DEV_GMAIL_CLIENT_SECRET: 'mock-secret', CONTRACT_TEST_GMAIL_SENDER: 'sender@example.com', ...options.env } },
    require(name) {
      if (name === '../shared/payment-email-assets') return assets
      if (name === '../shared/notification-email-assets') return notificationAssets
      if (name === '../shared/contract-email-assets') return contractAssets
      if (name === 'electron') return {
        app: { isPackaged: false, getPath: () => 'mock-profile', once() {}, removeListener() {} },
        safeStorage: { decryptString: () => JSON.stringify({ scope: 'https://www.googleapis.com/auth/gmail.send', gmail_client_id:'mock-id', gmail_sender_email:'sender@example.com', ...options.token }), isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value) },
        shell: { openExternal: async () => {} },
        ipcMain: { removeHandler: name => handlers.delete(name), handle: (name, fn) => handlers.set(name, fn) }
      }
      if (name === 'node:fs') return { existsSync: () => true, readFileSync: () => Buffer.from('mock-token'), mkdirSync() {}, writeFileSync: (_path, bytes) => oauth.saved.push(JSON.parse(bytes.toString())) }
      if (name === 'node:http') return { createServer: handler => {
        oauth.handler = handler; oauth.created++
        const server = { close() { oauth.closes++ }, once() { return server }, listen(_port, _host, callback) { callback(); return server } }
        return server
      } }
      if (name === 'googleapis') return { google: {
        auth: { OAuth2: class { setCredentials() {} on() {} generateAuthUrl(params) { oauth.options = params; return `https://accounts.google.com/o/oauth2/v2/auth?state=${params.state}` } async getToken() { return {tokens:{scope:'https://www.googleapis.com/auth/gmail.send',access_token:'test-only',id_token:'mock-identity'}} } async verifyIdToken() {return {getPayload:()=>({email:options.oauthEmail || 'sender@example.com',email_verified:true})}} } },
        gmail: () => ({ users: { messages: { send: async request => { requests.push(request); if (options.error) throw options.error; return { data: { id: 'mock-message' } } } } } })
      } }
      return require(name)
    }
  })
  exports.registerDevGmailHandlers()
  return { ...exports, handlers, requests, oauth }
}

function oauthResponse() {
  return { status: null, headers: {}, body: null, setHeader(name,value) { this.headers[name]=value }, writeHead(status,headers={}) { this.status=status; Object.assign(this.headers,headers) }, end(body) { this.body=body } }
}

test('one Electron OAuth session can open in another browser and rejects a wrong state without canceling', async () => {
  const h = harness()
  const pending = h.startDevGmailOAuth({openBrowser:false})
  assert.equal(h.startDevGmailOAuth({openBrowser:false}), pending)
  await new Promise(setImmediate)
  assert.equal(h.oauth.created, 1)
  const start = oauthResponse()
  await h.oauth.handler({method:'GET',url:'/authorize'},start)
  assert.equal(start.status, 302)
  assert.equal(new URL(start.headers.Location).searchParams.get('state'),h.oauth.options.state)
  assert.equal(h.oauth.options.login_hint,'sender@example.com')
  assert.equal(start.headers['Cache-Control'],'no-store')
  const invalid = oauthResponse()
  await h.oauth.handler({method:'GET',url:'/callback?state=wrong&code=test'},invalid)
  assert.equal(invalid.status,400)
  assert.equal(h.oauth.closes,0)
  const valid = oauthResponse()
  await h.oauth.handler({method:'GET',url:`/callback?state=${h.oauth.options.state}&code=test`},valid)
  assert.equal((await pending).ok,true)
  assert.equal(valid.status,200)
  assert.equal(h.oauth.closes,1)
  assert.equal(h.oauth.saved[0].gmail_client_id,'mock-id')
})

test('declined consent closes the pending OAuth session without saving credentials', async () => {
  const h = harness()
  const pending = h.startDevGmailOAuth({openBrowser:false})
  await new Promise(setImmediate)
  const response = oauthResponse()
  await h.oauth.handler({method:'GET',url:`/callback?state=${h.oauth.options.state}&error=access_denied`},response)
  assert.equal((await pending).ok,false)
  assert.equal(h.oauth.saved.length,0)
  assert.equal(h.oauth.closes,1)
})

test('dedicated sender refuses an old account token and does not send', async () => {
  const h = harness({env:{GMAIL_SENDER_EMAIL:'property@example.com'}})
  assert.equal(h.handlers.get('gmail:getAvailability')().authenticated,false)
  assert.equal(h.handlers.get('gmail:getAvailability')().senderEmail,'property@example.com')
  const result=await h.handlers.get('gmail:sendNotification')(null,{to:'receiver@example.com',subject:'Test',html:'Test'})
  assert.equal(result.notSent,true)
  assert.equal(h.requests.length,0)
})

test('test profile ignores the production sender inherited from root dotenv',()=>{
 const h=harness({env:{KMAP_CONTRACT_TEST:'1',GMAIL_SENDER_EMAIL:'production@example.com'}})
 assert.equal(h.handlers.get('gmail:getAvailability')().senderEmail,'sender@example.com')
 assert.equal(h.handlers.get('gmail:getAvailability')().authenticated,true)
})

test('OAuth verifies the actual Google identity before saving the sender token', async () => {
  for (const email of ['sender@example.com','other@example.com']) {
    const h=harness({oauthEmail:email}), pending=h.startDevGmailOAuth({openBrowser:false})
    await new Promise(setImmediate)
    const response=oauthResponse()
    await h.oauth.handler({method:'GET',url:`/callback?state=${h.oauth.options.state}&code=test`},response)
    assert.equal((await pending).ok,email==='sender@example.com')
    assert.equal(h.oauth.saved.length,email==='sender@example.com'?1:0)
    if (h.oauth.saved.length) assert.equal(h.oauth.saved[0].gmail_sender_email,email)
  }
})

function parse(raw) {
  const message = Buffer.from(raw, 'base64url').toString('utf8')
  const [headers, body] = message.split('\r\n\r\n')
  const unfolded = headers.replace(/\r\n[ \t]+/g, ' ')
  const subject = unfolded.split('\r\n').find(line => line.startsWith('Subject: ')).slice(9)
  const words = [...subject.matchAll(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g)]
  return { message, headers, words, subject: words.map(word => Buffer.from(word[1], 'base64').toString('utf8')).join(''), html: Buffer.from(body, 'base64').toString('utf8') }
}

test('Vietnamese subject and HTML round-trip through the actual Gmail IPC request', async () => {
  const h = harness()
  const payload = { to: 'receiver@example.com', subject: '[AN KHANG HOME] Email kiểm thử', html: '<p>Xin chào Đào Bình Yên, thanh toán công nợ.</p>' }
  const result = await h.handlers.get('gmail:sendNotification')(null, payload)
  assert.equal(result.ok, true)
  assert.equal(h.requests.length, 1)
  const mail = parse(h.requests[0].requestBody.raw)
  assert.equal(mail.subject, payload.subject)
  assert.equal(mail.html, payload.html)
  assert.match(mail.headers, /^To: receiver@example.com\r\nSubject: =\?UTF-8\?B\?/)
  assert.ok(mail.headers.split('\r\n').every(line => /^[\x00-\x7F]*$/.test(line)))
})

test('deleted Google project is a definite rejection, allowing contract retry', async () => {
  const h = harness({ error: new Error('Project #470025984975 has been deleted.') })
  const result = await h.handlers.get('gmail:sendNotification')(null, {to:'receiver@example.com',subject:'Test',html:'Test'})
  assert.equal(result.ok, false)
  assert.equal(result.notSent, true)
  assert.match(result.error, /project.*đã bị xóa/)
  assert.notEqual(result.reauthRequired, true)
})

test('network and server failures remain uncertain, preventing duplicate contract send', async () => {
  for (const error of [new Error('ETIMEDOUT'), Object.assign(new Error('Internal error'), {response:{status:503}})]) {
    const h = harness({error})
    const result = await h.handlers.get('gmail:sendNotification')(null, {to:'receiver@example.com',subject:'Test',html:'Test'})
    assert.equal(result.notSent, false)
  }
})

test('changed OAuth client does not reuse an old project token', async () => {
  const h = harness({token:{gmail_client_id:'old-client'}})
  assert.equal(h.handlers.get('gmail:getAvailability')().authenticated, false)
  const result = await h.handlers.get('gmail:sendNotification')(null, {to:'receiver@example.com',subject:'Test',html:'Test'})
  assert.equal(result.notSent, true)
  assert.equal(h.requests.length, 0)
})

test('long Vietnamese and emoji subjects fold into valid RFC 2047 words without broken Unicode', () => {
  const h = harness()
  const subject = 'Giao dịch SePay đã khớp — Phòng 152 🏠 '.repeat(12)
  const mail = parse(h.buildGmailRawMessage({ to: 'receiver@example.com', subject, html: 'Nội dung' }))
  assert.equal(mail.subject, subject)
  assert.ok(mail.words.length > 1)
  assert.ok(mail.words.every(word => word[0].length <= 75))
  assert.ok(mail.headers.split('\r\n').every(line => line.length <= 78))
})

test('ASCII, empty and multiline subjects remain readable without injecting headers', () => {
  const h = harness()
  for (const subject of ['Test email', '', 'Kiểm thử\r\nBcc: another@example.com']) {
    const mail = parse(h.buildGmailRawMessage({ to: 'receiver@example.com', subject, html: '' }))
    assert.equal(mail.subject, subject.replace(/[\r\n]+/g, ' '))
    assert.doesNotMatch(mail.headers, /\r\nBcc:/)
  }
})

test('payment email embeds the approved icon with matching CID and intact HTML', async () => {
  const h = harness()
  const html = `<p>Thanh toán thành công</p><img src="cid:${assets.PAYMENT_SUCCESS_ICON_CID}">`
  await h.handlers.get('gmail:sendNotification')(null, {
    to: 'receiver@example.com', subject: 'Thanh toán thành công', html
  })
  const mail = parse(h.requests[0].requestBody.raw)
  assert.equal(mail.subject, 'Thanh toán thành công')
  assert.match(mail.headers, /Content-Type: multipart\/related/)
  const boundary = mail.headers.match(/boundary="([^"]+)"/)[1]
  const sections = mail.message.split(`--${boundary}`).slice(1, -1)
  assert.equal(sections.length, 2)
  const decoded = sections.map(part => {
    const [headers, body] = part.trim().split('\r\n\r\n')
    assert.ok(body.split('\r\n').every(line => line.length <= 76))
    return { headers, bytes: Buffer.from(body, 'base64') }
  })
  assert.equal(decoded[0].bytes.toString('utf8'), html)
  assert.match(decoded[1].headers, /Content-Disposition: inline/)
  assert.ok(decoded[1].headers.includes(`Content-ID: <${assets.PAYMENT_SUCCESS_ICON_CID}>`))
  assert.deepEqual(decoded[1].bytes, fs.readFileSync(path.join(__dirname, '../src/renderer/src/assets/payment-success-icon.png')))
})

test('each notification embeds only its referenced status icon and resolves it in preview', () => {
  const h = harness()
  for (const [tone, icon] of Object.entries(notificationAssets.notificationEmailIcons)) {
    const html = `<p>${tone}</p><img src="cid:${icon.cid}">`
    const message = Buffer.from(h.buildGmailRawMessage({ to: 'receiver@example.com', subject: tone, html }), 'base64url').toString('utf8')
    assert.equal((message.match(/Content-ID:/g) || []).length, 1)
    assert.ok(message.includes(`Content-ID: <${icon.cid}>`))
    const boundary = message.match(/boundary="([^"]+)"/)[1]
    const parts = message.split(`--${boundary}`).slice(1, -1)
    assert.equal(Buffer.from(parts[0].trim().split('\r\n\r\n')[1], 'base64').toString('utf8'), html)
    assert.deepEqual(Buffer.from(parts[1].trim().split('\r\n\r\n')[1], 'base64'), Buffer.from(icon.base64, 'base64'))
    const preview = notificationAssets.notificationEmailPreviewHtml(html)
    assert.doesNotMatch(preview, /cid:/)
    assert.ok(preview.includes('data:image/png;base64,' + icon.base64))
  }
})

test('contract confirmation MIME includes the actual branded PNG with a working HTML link', () => {
  const h = harness()
  const url = 'https://ankhanghome-contract-test.pages.dev/contract-confirmation#token=test-only'
  const html = contractTemplate.contractEmailHtml({ tenantName: 'Khách thuê thử nghiệm', room: '999', moveInDate: '2026-10-07', url })
  const raw = Buffer.from(h.buildGmailRawMessage({ to: 'receiver@example.com', subject: 'Xác nhận hợp đồng', html }), 'base64url').toString('utf8')
  const boundary = raw.match(/boundary="([^"]+)"/)[1]
  const parts = raw.split(`--${boundary}`).slice(1, -1)
  assert.equal(parts.length, 2)
  const body = Buffer.from(parts[0].trim().split('\r\n\r\n')[1], 'base64').toString('utf8')
  assert.equal(body, html)
  assert.ok(body.includes(`href="${url}"`))
  assert.ok(body.includes('07/10/2026'))
  assert.ok(body.includes('Khách thuê thử nghiệm'))
  assert.match(parts[1], /Content-ID: <contract-confirmation-banner@ankhanghome>/)
  const image = Buffer.from(parts[1].trim().split('\r\n\r\n')[1], 'base64')
  assert.deepEqual(image, fs.readFileSync(path.join(__dirname, '../webmobile/assets/contract-confirmation-banner.png')))
  assert.doesNotMatch(contractAssets.contractEmailPreviewHtml(html), /src="cid:/)
})

test('contract email escapes tenant data and never fabricates a missing start date', () => {
  const html = contractTemplate.contractEmailHtml({ tenantName: '<script>test</script>', room: 'A&B', url: 'https://example.com/?x=1&y=2' })
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;test&lt;\/script&gt;/)
  assert.match(html, /A&amp;B/)
  assert.match(html, /href="https:\/\/example.com\/\?x=1&amp;y=2"/)
  assert.doesNotMatch(html, /Ngày bắt đầu/)
})
