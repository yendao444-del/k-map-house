import assert from 'node:assert/strict'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const dist = new URL('../../dist/', import.meta.url)
const version = JSON.parse(await readFile(new URL('version.json', dist), 'utf8'))
const origin = 'https://app.phongtroankhang.com'
const remoteVersion = await fetch(`${origin}/version.json?verify=security-profile-${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
assert.ok(remoteVersion.ok)
assert.equal((await remoteVersion.json()).buildId, version.buildId)
const files = (await readdir(new URL('assets/', dist))).filter(name => /^ProfileModal-.*\.js$/.test(name))
assert.equal(files.length, 1)
const local = await readFile(new URL('assets/' + files[0], dist))
const response = await fetch(`${origin}/assets/${files[0]}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
assert.ok(response.ok)
const remote = Buffer.from(await response.arrayBuffer())
assert.ok(local.equals(remote), 'Production profile chunk differs from local dist')
for (const text of ['Đã xác minh gần đây', 'Đã xác minh Google Authenticator thành công.', 'Tải lại thông tin bảo mật', 'authorize']) assert.ok(remote.toString().includes(text), `Missing behavior marker: ${text}`)
const report = { checkedAt: new Date().toISOString(), origin, buildId: version.buildId, profileChunk: files[0], sha256: createHash('sha256').update(remote).digest('hex'), bytesMatchLocalDist: true, verificationFeedbackPresent: true, scope: 'Public assets only. Authenticated behavior verified with local fixtures, not a real production account.' }
await writeFile(new URL('./production-verification.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
