import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { privateConfig, management, root } from './private-config.mjs'
const env = await privateConfig()
const sbUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const keys = await management(env, '/api-keys')
const serviceKey = keys.find(key => key.name === 'service_role')?.api_key
if (!serviceKey) throw new Error('Missing server-only Supabase key')
const localFile = path.join(root, '.env.production.local')
let local = await readFile(localFile, 'utf8')
for (const [name, value] of [['SUPABASE_URL', sbUrl], ['SUPABASE_SERVICE_ROLE_KEY', serviceKey]]) {
  local = local.replace(new RegExp(`^${name}=.*(?:\\r?\\n|$)`, 'gm'), '') + `\n${name}=${value}\n`
}
await writeFile(localFile, local)
await management(env, '/database/query', { query: await readFile(path.join(root, 'cloud/auth-schema.sql'), 'utf8') })
const accountsFile = path.join(root, 'qa/private/demo-login-accounts.json')
let credentials = []
try { credentials = JSON.parse(await readFile(accountsFile, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
const allowed = [{ kind: 'existing', room: '101', email: 'demo101@phongtroankhang.com', name: 'Nguyễn Minh Anh' }, { kind: 'new', room: '102', email: 'demo102@phongtroankhang.com', name: 'Trần Hoài Nam' }]
for (const fixture of allowed) {
  const existing = credentials.find(item => item.email === fixture.email)
  if (existing) {
    const [valid] = await management(env, '/database/query', { query: `select exists(select 1 from public.webmobile_demo_accounts a join auth.users u on u.id=a.user_id where u.id='${existing.userId}'::uuid and u.role='anon' and u.raw_app_meta_data->>'portal_role'='webmobile_demo_tenant') as ok` })
    if (!valid.ok) throw new Error('Existing demo credentials require review; not resetting passwords.')
    continue
  }
  const password = `Ak!${randomBytes(15).toString('base64url')}`
  const response = await fetch(`${sbUrl}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: fixture.email, password, email_confirm: true, app_metadata: { portal_role: 'webmobile_demo_tenant' }, user_metadata: { full_name: fixture.name, username: `webmobile_demo_${fixture.room}` } }), signal: AbortSignal.timeout(20000)
  })
  if (!response.ok) throw new Error(`Create demo account failed ${response.status}; no passwords printed`)
  const user = await response.json()
  if (!/^[a-f0-9-]{36}$/i.test(user.id)) throw new Error('Invalid Supabase user ID')
  // The default staff-provisioning trigger creates a profile. Remove ONLY this new
  // disposable demo profile, and give its Auth token the already restricted anon
  // role. This does not change privileges/policies for Electron staff.
  await management(env, '/database/query', { query: `begin;
    update auth.users set role='anon' where id='${user.id}'::uuid and raw_app_meta_data->>'portal_role'='webmobile_demo_tenant';
    delete from public.users where id='${user.id}'::uuid;
    insert into public.webmobile_demo_accounts(user_id,tenant_kind,contract_id) values('${user.id}'::uuid,'${fixture.kind}','demo-current-${fixture.room}');
    commit;` })
  credentials.push({ ...fixture, password, userId: user.id })
  await mkdir(path.dirname(accountsFile), { recursive: true })
  await writeFile(accountsFile, JSON.stringify(credentials, null, 2)+'\n')
}
const instructions = ['# Tài khoản thử website AN KHANG HOME', '', 'URL: https://pay.phongtroankhang.com/', '', 'Chỉ dùng dữ liệu demo; không chuyển tiền khi thử.', '', ...credentials.flatMap(account => [`## Phòng ${account.room}`, '', `Email: ${account.email}`, `Mật khẩu: ${account.password}`, `Trạng thái: ${account.kind === 'new' ? 'Khách mới, không có lịch sử trước' : 'Khách đang thuê, có lịch sử hợp đồng demo'}`, ''])]
await writeFile(path.join(root, 'qa/private/demo-login-accounts.md'), instructions.join('\n'))
console.log('Two isolated Supabase demo accounts ready. Credentials saved only in qa/private/demo-login-accounts.md.')
