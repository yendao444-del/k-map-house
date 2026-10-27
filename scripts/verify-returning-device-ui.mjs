import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Admin/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe'}),checks=[]
try{
 for(const width of [390,320]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:4178/qa/returning-device/index.html')
  await page.getByText('Google Authenticator và mã khôi phục đã được thiết lập.',{exact:false}).waitFor()
  assert.equal(await page.getByRole('list',{name:'Các bước thiết lập bảo mật'}).count(),0)
  assert.equal(await page.getByText('Lưu mã khôi phục',{exact:true}).count(),0)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await page.screenshot({path:`docs/security/qa/returning-device-${width}-2026-10-12.png`,fullPage:true})
  await page.getByRole('button',{name:'Gửi mã xác minh email',exact:true}).click()
  await page.getByRole('textbox',{name:'Mã xác minh email'}).fill('123456')
  await page.getByRole('button',{name:'Xác minh email',exact:true}).click()
  await page.getByRole('status').filter({hasText:'Đăng nhập thành công'}).waitFor()
  const calls=await page.evaluate(()=>window.qaSecurityCalls)
  assert.ok(calls.includes('authorize'));assert.ok(!calls.includes('recovery_issue')&&!calls.includes('recovery_ack'))
  assert.equal(errors.length,0,errors.join(';'))
  checks.push({width,returningAccountSkipsRecoverySetup:true,afterEmailLoginCompletes:true,noRecoveryCodeRotation:true,noHorizontalOverflow:true})
  await page.close()
 }
 const fresh=await browser.newPage({viewport:{width:390,height:844}})
 await fresh.goto('http://127.0.0.1:4178/qa/returning-device/index.html?scenario=new')
 await fresh.getByRole('list',{name:'Các bước thiết lập bảo mật'}).waitFor()
 await fresh.getByRole('button',{name:'Gửi mã xác minh email',exact:true}).click()
 await fresh.getByRole('textbox',{name:'Mã xác minh email'}).fill('123456')
 await fresh.getByRole('button',{name:'Xác minh email',exact:true}).click()
 await fresh.getByRole('heading',{name:'Lưu mã khôi phục',exact:true}).waitFor()
 assert.ok(!(await fresh.evaluate(()=>window.qaSecurityCalls)).includes('authorize'))
 checks.push({firstSetupStillRequiresSavedCodes:true,noAuthorizationBeforeAcknowledgement:true})
 const failed=await browser.newPage({viewport:{width:390,height:844}})
 await failed.goto('http://127.0.0.1:4178/qa/returning-device/index.html?scenario=error')
 await failed.getByRole('alert').filter({hasText:'Không thể tải trạng thái bảo mật.'}).waitFor()
 assert.equal(await failed.getByRole('button',{name:'Gửi mã xác minh email',exact:true}).isDisabled(),true)
 assert.equal(await failed.getByRole('list',{name:'Các bước thiết lập bảo mật'}).count(),0)
 await failed.getByRole('button',{name:'Thử lại kiểm tra bảo mật',exact:true}).click()
 await failed.getByText('Google Authenticator và mã khôi phục đã được thiết lập.',{exact:false}).waitFor()
 assert.equal(await failed.getByRole('button',{name:'Gửi mã xác minh email',exact:true}).isEnabled(),true)
 checks.push({statusFailureDoesNotPretendRecoveryPending:true,retryWorks:true})
}finally{await browser.close()}
const report={at:new Date().toISOString(),checks,scope:'Development UI fixtures only; no real messages, recovery codes or user data.'}
await writeFile('docs/security/qa/returning-device-ui-2026-10-12.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
