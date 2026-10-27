import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const dir = 'docs/design/system-account-security'
await mkdir(dir, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe' })
const checks = []
try {
  for (const width of [1920, 1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: width >= 768 ? 1080 : 844 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:4178/') ? route.continue() : route.abort())
    await page.goto('http://127.0.0.1:4178/qa/system-account-security/index.html')
    const statuses = page.locator('[aria-label="Trạng thái bảo mật"]:visible')
    await statuses.first().waitFor()
    assert.equal(await statuses.count(), 3)
    assert.equal(await page.getByText('Authenticator · Đã xác thực', { exact: true }).filter({ visible: true }).count(), 2)
    assert.equal(await page.getByText('Email · Đã xác minh', { exact: true }).filter({ visible: true }).count(), 2)
    assert.equal(await page.getByText('Authenticator · Chưa xác thực', { exact: true }).filter({ visible: true }).count(), 1)
    assert.equal(await page.getByText('Email · Chưa xác minh', { exact: true }).filter({ visible: true }).count(), 1)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Document overflow at ' + width)
    if (width < 768) await page.getByRole('button', { name: 'Xem chi tiết tài khoản Nguyễn Minh An', exact: true }).scrollIntoViewIfNeeded()
    if (width >= 1440) assert.equal(await page.locator('table:visible').evaluate(table => table.parentElement.scrollWidth > table.parentElement.clientWidth), false, 'Account table clips desktop actions')
    await page.screenshot({ path: `${dir}/implemented-${width}.png`, fullPage: true })
    await page.getByPlaceholder('Tìm kiếm tài khoản...').fill('hainam')
    assert.equal(await statuses.count(), 1)
    await page.evaluate(() => { window.qaDirectoryRows[1].authenticator_verified = true })
    await page.getByTitle('Làm mới danh sách', { exact: true }).click()
    await page.getByText('Authenticator · Đã xác thực', { exact: true }).filter({ visible: true }).waitFor()
    assert.equal(await page.getByText('Authenticator · Chưa xác thực', { exact: true }).filter({ visible: true }).count(), 0)
    if (width < 768) {
      await page.getByRole('button', { name: 'Xem chi tiết tài khoản Trần Hải Nam', exact: true }).click()
      await page.getByRole('heading', { name: 'Chi tiết tài khoản', exact: true }).waitFor()
      assert.equal(await page.getByText('Email · Đã xác minh', { exact: true }).filter({ visible: true }).count(), 2)
    }
    assert.deepEqual(errors, [])
    checks.push({ width, separateSecurityStates: true, search: true, refresh: true, noDocumentOverflow: true, mobileDetail: width < 768 })
    await page.close()
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } })
  await page.goto('http://127.0.0.1:4178/qa/system-account-security/index.html?unknown=1')
  await page.getByText('Authenticator · Chưa có dữ liệu', { exact: true }).filter({ visible: true }).waitFor()
  assert.equal(await page.getByText('Email · Chưa có dữ liệu', { exact: true }).filter({ visible: true }).count(), 1)
  checks.push({ unknownFlagsDisplayedAsUnknown: true })
  await page.goto('http://127.0.0.1:4178/qa/system-account-security/index.html?error=1')
  await page.getByRole('alert').filter({ hasText: 'Không thể tải danh sách tài khoản' }).waitFor()
  assert.equal(await page.getByText('Không có tài khoản phù hợp', { exact: true }).count(), 0)
  assert.equal(await page.getByText('00', { exact: true }).count(), 0)
  await page.getByTitle('Làm mới danh sách', { exact: true }).click()
  await page.locator('[aria-label="Trạng thái bảo mật"]:visible').first().waitFor()
  assert.equal(await page.getByRole('alert').count(), 0)
  checks.push({ failedLoadDoesNotReportZeroAccounts: true, refreshRecoversFromReadFailure: true })
} finally { await browser.close() }
const report = { testedAt: new Date().toISOString(), checks, scope: 'Actual SettingsTab with a synthetic RPC fixture; no real accounts or remote mutations.' }
await writeFile(`${dir}/ui-checks.json`, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
