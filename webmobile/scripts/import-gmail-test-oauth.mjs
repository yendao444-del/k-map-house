import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { root } from './private-config.mjs'
import { contractTestConfig } from './contract-test-config.mjs'

// Import only a downloaded OAuth client into the isolated TEST config. Never
// import access/refresh tokens or modify the production Gmail configuration.
const input = process.argv[2]?.replace(/^"|"$/g, '')
if (!input) throw new Error('Chọn file JSON OAuth tải từ Google Cloud.')
const json = JSON.parse(await readFile(path.resolve(input), 'utf8'))
const client = json.installed || json.web
if (!client || client.project_id !== 'ankhang-home-gmail') throw new Error('File phải thuộc project ankhang-home-gmail.')
if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(client.client_id || '') || !/^[\w-]+$/.test(client.client_secret || '')) throw new Error('Client ID hoặc client secret không hợp lệ.')
if (json.web && !client.redirect_uris?.includes('http://localhost:3456/callback')) throw new Error('Web OAuth cần redirect URI http://localhost:3456/callback.')
await contractTestConfig()
const configPath = path.join(root, '.env.contract-test.local')
let config = await readFile(configPath, 'utf8')
for (const [key, value] of Object.entries({ DEV_GMAIL_CLIENT_ID: client.client_id, DEV_GMAIL_CLIENT_SECRET: client.client_secret })) {
  const expression = new RegExp(`^${key}\\s*=.*$`, 'gm')
  if (expression.test(config)) config = config.replace(expression, () => `${key}=${value}`)
  else config += `\n${key}=${value}\n`
}
await writeFile(configPath, config, { mode: 0o600 })
console.log('Đã nhập cấu hình Gmail vào môi trường TEST. Đóng Electron TEST, mở start-contract-test.bat và bấm Kết nối Gmail.')
