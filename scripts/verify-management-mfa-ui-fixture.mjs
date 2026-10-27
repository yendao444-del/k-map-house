import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { writeFile, readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
const fixturePath = path.join(tmpdir(), 'ankhang-mandatory-mfa-ui-fixture.json')
const request = async (endpoint, method, body) => {
  const response = await fetch(env.SUPABASE_URL + '/auth/v1/' + endpoint, { method, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) })
  assert.ok(response.ok, 'Fixture Auth HTTP ' + response.status)
  return response.json().catch(() => null)
}
if (process.argv.includes('--cleanup')) {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
  assert.match(fixture.id, /^[a-f0-9-]{36}$/)
  const rows = await management(env, '/database/query', { query: `select count(*)::int n from auth.users where id='${fixture.id}' and raw_user_meta_data->>'purpose'='management-mfa-disposable-verification';` })
  assert.equal(rows[0].n, 1, 'Only a disposable fixture may be removed')
  await management(env, '/database/query', { query: `delete from public.users where id='${fixture.id}' and username='${fixture.id}';` })
  await request('admin/users/' + fixture.id, 'DELETE')
  await unlink(fixturePath)
  console.log('Disposable UI account and local credential file removed')
} else {
  // Exclusive creation prevents overwriting or losing an earlier cleanup handle.
  const fixture = { email: `ui-mfa-${randomBytes(8).toString('hex')}@example.invalid`, password: randomBytes(24).toString('base64url') }
  await writeFile(fixturePath, JSON.stringify(fixture), { flag: 'wx', mode: 0o600 })
  fixture.id = (await request('admin/users', 'POST', { ...fixture, email_confirm: true, user_metadata: { purpose: 'management-mfa-disposable-verification' } })).id
  await writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 })
  await management(env, '/database/query', { query: `insert into public.users(id,email,username,full_name,role,status) values('${fixture.id}','${fixture.email}','${fixture.id}','MFA UI fixture','user','active') on conflict(id) do update set role='user',status='active';` })
  console.log('Disposable staff UI fixture ready; credentials stored temporarily without logging')
}
