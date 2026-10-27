import assert from 'node:assert/strict'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const dist = new URL('../adminpwa/dist/',import.meta.url)
const origin='https://app.phongtroankhang.com'
const version=JSON.parse(await readFile(new URL('version.json',dist),'utf8'))
const remote=await fetch(origin+'/version.json?verify='+Date.now()).then(r=>r.json())
assert.equal(remote.buildId,version.buildId)
const assets=await readdir(new URL('assets/',dist))
const profile=assets.find(name=>/^ProfileModal-.*\.js$/.test(name))
assert.ok(profile)
const local=await readFile(new URL('assets/'+profile,dist))
const response=await fetch(origin+'/assets/'+profile)
assert.equal(response.status,200)
const published=Buffer.from(await response.arrayBuffer())
const hash=value=>createHash('sha256').update(value).digest('hex')
assert.equal(hash(published),hash(local))
const code=published.toString('utf8')
const style=assets.find(name=>/^index-.*\.css$/.test(name))
const styleLocal=await readFile(new URL('assets/'+style,dist))
const styleResponse=await fetch(origin+'/assets/'+style)
assert.equal(styleResponse.status,200)
const styleRemote=Buffer.from(await styleResponse.arrayBuffer())
assert.equal(hash(styleRemote),hash(styleLocal))
if(process.argv.includes('--responsive')) {
  for(const marker of ['minmax(0,1.4fr)','max-height:700px','font-size:16px']) assert.ok(styleRemote.toString('utf8').includes(marker),'Missing responsive CSS '+marker)
}
for(const marker of ['Phương thức xác minh','Xác minh Gmail','profile-email-code']) assert.ok(code.includes(marker),'Missing '+marker)
const main=assets.find(name=>/^index-.*\.js$/.test(name))
const mainLocal=await readFile(new URL('assets/'+main,dist))
const mainResponse=await fetch(origin+'/assets/'+main)
assert.equal(mainResponse.status,200)
const mainRemote=Buffer.from(await mainResponse.arrayBuffer())
assert.equal(hash(mainRemote),hash(mainLocal))
for(const marker of ['management_user_directory','authenticator_verified,email_verified']) assert.ok(mainRemote.toString('utf8').includes(marker),'Missing '+marker)
const qa=await fetch(origin+'/qa/profile-2fa/index.html')
// Production's SPA fallback must never ship the synthetic development entry.
const qaBody=await qa.text()
assert.ok(!qaBody.includes('/qa/profile-2fa/main.tsx'))
const report={checkedAt:new Date().toISOString(),url:origin,buildId:remote.buildId,profileAsset:profile,sha256:hash(published),stylesheet:style,stylesheetSha256:hash(styleRemote),remoteMatchesLocal:true,profile2faPresent:true,responsiveVerified:process.argv.includes('--responsive'),qaFixtureNotPublished:true}
await writeFile(new URL('../docs/design/profile-2fa/'+(process.argv.includes('--responsive')?'responsive-production-verification.json':'production-verification.json'),import.meta.url),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
