import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url)
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe'}),evidence=[]
try {
 for(const [width,height] of [[320,568],[390,844]]) {
  const page=await browser.newPage({viewport:{width,height},isMobile:true,deviceScaleFactor:1}),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto('http://127.0.0.1:5297/')
  await page.getByRole('heading',{name:'Phòng 999',exact:true}).waitFor()
  await page.getByRole('heading',{name:'Điều hòa',exact:true}).waitFor()
  assert.equal(await page.getByText('0 kWh',{exact:true}).count(),1)
  assert.equal(await page.getByText('3.500đ/kWh',{exact:true}).count(),1)
  assert.equal(await page.getByRole('button',{name:/Tài sản trong phòng/}).count(),0)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false)
  assert.equal(await page.getByRole('button',{name:'Đăng xuất',exact:true}).count(),0)
  const menu=page.getByRole('button',{name:'Mở menu',exact:true}),box=await menu.boundingBox()
  assert.ok(box.x<width/3);assert.ok(box.width>=44&&box.height>=44)
  await page.screenshot({path:`webmobile/qa/tenant-menu-home-${width}.png`,fullPage:true})
  await menu.click()
  await page.getByRole('navigation',{name:'Menu người thuê'}).waitFor()
  await page.screenshot({path:`webmobile/qa/tenant-menu-${width}.png`,fullPage:true})
  assert.deepEqual(await page.getByRole('navigation',{name:'Menu người thuê'}).getByRole('button').allTextContents(),['Trang chủ','Thông tin phòng','Thanh toán','Tài khoản','Đăng xuất'])
  await page.getByRole('button',{name:'Thông tin phòng',exact:true}).click()
  await page.getByRole('button',{name:'Thiết bị trong phòng',exact:true}).click()
  await page.getByRole('heading',{name:'Điều hòa',exact:true}).waitFor()
  assert.equal(await page.getByText('SL 2',{exact:true}).count(),1)
  assert.equal(await page.getByText('Đang sửa chữa',{exact:true}).count(),1)
  await page.screenshot({path:`webmobile/qa/tenant-assets-${width}.png`,fullPage:true})
  await page.getByRole('button',{name:'Điện & nước',exact:true}).click()
  await page.getByText('0 kWh',{exact:true}).waitFor()
  assert.equal(await page.getByText('3.500đ/kWh',{exact:true}).count(),1)
  await page.screenshot({path:`webmobile/qa/tenant-room-details-${width}.png`,fullPage:true})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false)
  assert.deepEqual(errors,[])
  evidence.push({width,height,leftMenu:true,homeShowsRoomUtilitiesAndAssets:true,assetsAndStatuses:true,zeroInitialReading:true,horizontalOverflow:false,errors})
  await page.close()
 }
 const page=await browser.newPage({viewport:{width:320,height:568}})
 for(const [flag,message] of [['empty','Chủ nhà chưa cập nhật tài sản cho phòng này.'],['unavailable','Chưa tải được danh sách tài sản. Bấm làm mới để thử lại.'],['no-contract','Tài sản sẽ hiển thị khi có hợp đồng đang hiệu lực.']]) {
  await page.goto('http://127.0.0.1:5297/?'+flag)
  if(flag==='no-contract') {
   await page.getByText('Chủ nhà chưa gắn hợp đồng đang hiệu lực cho tài khoản của bạn.',{exact:true}).waitFor()
   assert.equal(await page.getByText('3.500đ/kWh',{exact:true}).count(),0)
   assert.equal(await page.getByRole('heading',{name:'Điều hòa',exact:true}).count(),0)
  } else await page.getByText(message,{exact:true}).waitFor()
  await page.getByRole('button',{name:'Mở menu',exact:true}).click()
  await page.getByRole('button',{name:'Thông tin phòng',exact:true}).click()
  await page.getByRole('button',{name:'Thiết bị trong phòng',exact:true}).click()
  await page.getByText(flag==='no-contract'?'Thông tin sẽ hiển thị khi có hợp đồng đang hiệu lực.':message,{exact:true}).waitFor()
 }
 await page.getByRole('button',{name:'Mở menu',exact:true}).click()
 await page.getByRole('button',{name:'Đăng xuất',exact:true}).click()
 await page.getByText('Đã đăng xuất QA',{exact:true}).waitFor()
 await writeFile('webmobile/qa/tenant-room-menu-ui.json',JSON.stringify({at:new Date().toISOString(),passed:true,evidence,emptyAndUnavailableStates:true,noContractState:true,logout:true,syntheticOnly:true},null,2)+'\n')
 console.log('Mobile UI verified at 320x568 and 390x844, including inventory, menu, empty/error states and logout.')
} finally {await browser.close()}
