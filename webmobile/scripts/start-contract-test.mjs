import { spawn, execFileSync } from 'node:child_process'
import path from 'node:path'
import { contractTestConfig } from './contract-test-config.mjs'
import { privateConfig, root } from './private-config.mjs'
const config = await contractTestConfig(), shared = await privateConfig()
const workspace = path.resolve(root,'..')
const env = { ...process.env, ...config, KMAP_CONTRACT_TEST:'1', KMAP_CONTRACT_TEST_PROFILE:path.join(root,'.contract-test-profile'),
  DEV_GMAIL_CLIENT_ID:config.DEV_GMAIL_CLIENT_ID ?? shared.DEV_GMAIL_CLIENT_ID ?? '', DEV_GMAIL_CLIENT_SECRET:config.DEV_GMAIL_CLIENT_SECRET ?? shared.DEV_GMAIL_CLIENT_SECRET ?? '', CONTRACT_TEST_GMAIL_SENDER:config.CONTRACT_TEST_GMAIL_SENDER || 'yendao444@gmail.com', NODE_USE_SYSTEM_CA:'1',
  VITE_SUPABASE_URL:config.SUPABASE_URL,VITE_SUPABASE_ANON_KEY:config.VITE_SUPABASE_ANON_KEY }
// Never inherit test credentials as general provider/deployment credentials.
delete env.SUPABASE_SERVICE_ROLE_KEY; delete env.SUPABASE_ACCESS_TOKEN
console.log('AN KHANG HOME — ELECTRON TEST (Supabase TEST + schema riêng)')
console.log('Cùng giao diện Electron. Gmail chỉ gửi tới email cho phép. Không có SePay thật.')
console.log(`Website: ${config.CONTRACT_PUBLIC_URL}`)
console.log('Tài khoản admin thử nghiệm xem trong webmobile/qa/private/test-login.txt')
const vite = path.join(workspace,'node_modules/electron-vite/bin/electron-vite.js')
async function run(args) { await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:workspace,env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Electron TEST build ${code}`)))}) }
// Opening the launcher twice focuses the existing test, without rebuilding files
// underneath its active renderer or touching the production Electron process.
const testRunning = process.platform === 'win32' && execFileSync('powershell.exe', ['-NoProfile','-Command', "@(Get-CimInstance Win32_Process -Filter \"Name = 'electron.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.Replace('\\','/').Contains('/.contract-test-out/main/index.js') }).Count"], { windowsHide:true, encoding:'utf8' }).trim() !== '0'
if (testRunning) console.log('Bản TEST đang mở. Đang đưa cửa sổ TEST hiện tại lên trước.')
else await run([vite,'build'])
const child=spawn(path.join(workspace,'node_modules/electron/dist/electron.exe'),[path.join(workspace,'.contract-test-out/main/index.js')],{cwd:workspace,env,stdio:'inherit',windowsHide:false})
child.on('error',error=>{console.error(error.message);process.exitCode=1})
child.on('exit',code=>{process.exitCode=code||0})
