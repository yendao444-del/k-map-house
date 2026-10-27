import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe' })
const checks = []
try {
  for (const width of [320,390,1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 844 } })
    const errors=[];page.on('pageerror',e=>errors.push(e.message))
    await page.goto('http://127.0.0.1:4178/qa/email-login/index.html')
    await page.getByRole('button',{name:'Thử phương thức khác',exact:true}).click()
    await page.getByRole('button',{name:'Gửi mã qua email đã xác minh',exact:true}).click()
    await page.getByRole('textbox',{name:'Mã email xác minh'}).waitFor()
    await page.screenshot({path:`docs/security/qa/email-login-${width}.png`,fullPage:true})
    assert.equal(await page.getByRole('button',{name:/Gửi lại mã sau/}).isDisabled(),true)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    await page.getByRole('textbox',{name:'Mã email xác minh'}).fill('000000')
    await page.getByRole('button',{name:'Xác minh email',exact:true}).click()
    await page.getByRole('alert').filter({hasText:'Mã xác minh không đúng'}).waitFor()
    assert.equal(await page.getByRole('status').filter({hasText:'Đăng nhập thành công'}).count(),0)
    await page.getByRole('textbox',{name:'Mã email xác minh'}).fill('123456')
    await page.getByRole('button',{name:'Xác minh email',exact:true}).click()
    await page.getByRole('status').filter({hasText:'Đăng nhập thành công'}).waitFor()
    const calls=await page.evaluate(()=>window.qaEmailLoginCalls)
    assert.ok(!calls.some(c=>c.action==='totp_verify'))
    assert.equal(errors.length,0,errors.join(';'))
    checks.push({width,emailLoginWithoutTotp:true,wrongOtpDenied:true,resendCooldown:true,noHorizontalOverflow:true});await page.close()
  }
  for(const scenario of ['unverified','send-failed','totp','switch','cancel']) {
    const page=await browser.newPage({viewport:{width:390,height:844}})
    await page.goto(`http://127.0.0.1:4178/qa/email-login/index.html?scenario=${scenario}`)
    if(scenario==='totp') {
      await page.getByRole('textbox',{name:'Mã Google Authenticator'}).fill('123456')
      await page.getByRole('button',{name:'Xác minh mã',exact:true}).click()
      await page.getByRole('status').filter({hasText:'Đăng nhập thành công'}).waitFor()
    } else {
      await page.getByRole('button',{name:'Thử phương thức khác',exact:true}).click()
      const email=page.getByRole('button',{name:'Gửi mã qua email đã xác minh',exact:true})
      if(scenario==='unverified') { assert.equal(await email.isDisabled(),true) }
      else {
        await email.click()
        if(scenario==='send-failed') {
          await page.getByRole('alert').filter({hasText:'Chưa gửi được email'}).waitFor()
          assert.equal(await page.getByRole('button',{name:/Gửi lại mã sau/}).isDisabled(),true)
        }
        else if(scenario==='switch') {
          await page.getByRole('button',{name:'Thử phương thức khác',exact:true}).click()
          await page.getByRole('button',{name:'Google Authenticator',exact:true}).click()
          await page.getByRole('textbox',{name:'Mã Google Authenticator'}).waitFor()
        } else {
          await page.getByRole('button',{name:'Quay lại đăng nhập',exact:true}).click()
          await page.getByPlaceholder('Nhập email hoặc tên đăng nhập').waitFor()
          assert.ok((await page.evaluate(()=>window.qaEmailLoginCalls)).includes('signout'))
        }
      }
    }
    checks.push({scenario,passed:true});await page.close()
  }
} finally { await browser.close() }
const report={at:new Date().toISOString(),fixtureOnly:true,realEmailsSent:false,checks}
await writeFile('docs/security/qa/email-login-ui.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
