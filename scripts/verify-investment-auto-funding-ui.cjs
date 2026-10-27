// Isolated browser fixture: never connects to the database or spends real funds.
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')
const { build } = require('esbuild')
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

async function bundle(base) {
  const root = path.resolve(base).replaceAll('\\', '/')
  const entry = `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {TransactionModal} from '${root}/components/InvestmentsTab.tsx';
    import {GoldTradeModal} from '${root}/components/investment-trackers/GoldTradeModal.tsx';
    import {prepareInvestmentPurchase} from '${root}/lib/investment-auto-funding.ts';
    import {useInvestmentFundingConfirmation} from '${root}/components/InvestmentFundingConfirmation.tsx';
    import {commitInvestmentWallet} from '${root}/lib/investment-funding.ts';
    const params=new URLSearchParams(location.search), category=params.get('category')||'gold';
    const initial=Number(params.get('initial')||0), available=Number(params.get('operating')||20000000);
    const cash=Number(params.get('cash')??3000000);
    const operating={cashBalance:cash,bankBalance:available-cash,totalBalance:available,availableBalance:available,entries:[]};
    const wallet={cashBalance:initial,bankBalance:initial,totalBalance:initial,availableBalance:initial,entries:[]};
    window.api={investment:{fundNav:async()=>({priceVnd:140000,source:'QA',quotedAt:'2026-10-20'})}};
    window.qa={postings:[],saved:null,closed:false};
    let confirmTopUp;
    const current={holdings:[],transactions:initial?[{id:'opening',date:'2026-10-20',transactionType:'deposit',assetSymbol:'CASH',fundingSource:'investment-wallet',amountVnd:initial,walletPosting:{paymentMethod:'transfer',amount:initial}}]:[],portfolioSnapshots:[],categoryTargets:{},pwaVersion:3};
    async function onSave(input){
      const next={id:'purchase',date:input.date,assetSymbol:input.symbol,transactionType:'buy',amountVnd:input.amount,quantity:input.quantity,fundingSource:'investment-wallet',walletPosting:{paymentMethod:input.paymentMethod,amount:-input.amount}};
      const nextStore={...current,transactions:[...current.transactions,next]};
      const prepare=()=>prepareInvestmentPurchase({next,nextStore,readOperating:async()=>operating,confirm:plan=>confirmTopUp(plan)});
      ${base.startsWith('adminpwa') ? 'window.qa.saved=(await prepare()).store;' : `await commitInvestmentWallet({next,nextStore,preparePurchase:prepare,readCurrent:async()=>current,readOperating:async()=>operating,createPosting:async p=>{window.qa.postings.push(p);return 'receipt-'+window.qa.postings.length},removePosting:async()=>{},persist:async s=>{window.qa.saved=s}});`}
    }
    const common={walletSummary:wallet,operatingWalletSummary:operating,onClose:()=>{window.qa.closed=true},onSave};
    const root=createRoot(document.getElementById('root'));
    window.qa.unmount=()=>root.unmount();
    function App(){const confirmation=useInvestmentFundingConfirmation(); confirmTopUp=confirmation.confirmTopUp; return <>{category==='gold'?<GoldTradeModal {...common} mode="buy" holdings={[]}/>:<TransactionModal {...common} scopedCategory={category} initialType="buy" forceTransaction/>}{confirmation.confirmationDialog}</>}
    root.render(<App/>);
  `
  const result = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': JSON.stringify({VITE_SUPABASE_URL:'https://fixture.invalid',VITE_SUPABASE_ANON_KEY:'fixture-only-public-key'}) }, loader: { '.css': 'empty', '.png': 'dataurl', '.webp': 'dataurl' }, plugins: [{ name: 'isolated-fixture', setup(b) {
    b.onResolve({ filter: /^react(\/|$)/ }, args => ({ path: require.resolve(args.path) }))
    b.onResolve({ filter: /\.css$/ }, () => ({ path: 'empty-css', namespace: 'empty' }))
    b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' }))
    b.onLoad({ filter: /InvestmentsTab\.tsx$/ }, async args => ({ contents: await fs.readFile(args.path, 'utf8') + '\nexport { TransactionModal };', loader: 'tsx' }))
    b.onResolve({ filter: /\/goldApi$/ }, () => ({ path: 'gold-fixture', namespace: 'fixture' }))
    b.onResolve({ filter: /\/security-quote$/ }, () => ({ path: 'quote-fixture', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'quote-fixture'
      ? `export async function fetchSecurityQuote(){return {priceVnd:140000,source:'QA',quotedAt:'2026-10-20'}}`
      : `export const FALLBACK_GOLD_PRICES={}; export async function fetchCurrentGoldPrices(){return null} export async function fetchMyHanhPrices(){return null} export async function fetchGoldHistory(){return {history:[]}} export function suggestedGoldPricePerChi(){return 0} export function suggestedMyHanhPricePerChi(){return 0}` }))
  } }] })
  return result.outputFiles[0].text
}

;(async () => {
  const bundles = { electron: await bundle('src/renderer/src'), pwa: await bundle('adminpwa/src/renderer/src') }
  const modalCss = await fs.readFile('src/renderer/src/components/investment-funding-confirmation.css', 'utf8')
  const goldCss = await fs.readFile('src/renderer/src/components/investment-trackers/gold-trade-modal.css', 'utf8')
  const mainCss = await fs.readFile('src/renderer/src/assets/main.css', 'utf8')
  const faceted = mainCss.slice(mainCss.indexOf('.room-primary-faceted,'), mainCss.indexOf('/* Unpaid actions'))
  const fontFaces = mainCss.match(/@font-face\s*\{[^}]+\}/g).join('\n').replaceAll('./fonts/', '/')
  const css = `*{box-sizing:border-box}body{margin:0;background:#0a1220;font-family:Inter,'Segoe UI',sans-serif}button,input{font:inherit}button{cursor:pointer}button{border:0}svg{vertical-align:middle} ${fontFaces} ${faceted} ${goldCss} ${modalCss}`
  const server = http.createServer((req, res) => {
    if (/^\/inter-(latin|vietnamese)\.woff2$/.test(req.url)) { fs.readFile(path.join('src/renderer/src/assets/fonts',req.url.slice(1))).then(bytes => { res.setHeader('Content-Type','font/woff2'); res.end(bytes) }).catch(() => {res.statusCode=404;res.end()}); return }
    if (req.url.split('?')[0].endsWith('.js')) { res.setHeader('Content-Type', 'application/javascript'); res.end(bundles[req.url.includes('electron') ? 'electron' : 'pwa']); return }
    res.setHeader('Content-Type', 'text/html'); res.end('<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script src="/' + (req.url.includes('electron') ? 'electron' : 'pwa') + '.js"></script></html>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  if (process.argv.includes('--serve')) { console.log(origin); return }
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe' })
  const checks = []
  try {
    for (const platform of ['electron', 'pwa']) {
      for (const category of ['gold', 'stocks', 'bonds', 'savings']) {
        console.log('Checking', platform, category)
        const page = await browser.newPage()
        page.setDefaultTimeout(10000)
        const errors = []
        page.on('pageerror', error => { errors.push(error.message); console.error(platform, category, error.message) })
        page.on('dialog', async dialog => { errors.push('Unexpected native dialog'); await dialog.dismiss() })
        await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort())
        const setup = async params => {
          await page.goto(`${origin}/${platform}?category=${category}&${params}`)
          if (category === 'gold') { await page.locator('#gold-trade-price:enabled').waitFor(); await page.locator('#gold-trade-price').fill('14000000') }
          else if (category === 'savings') await page.getByLabel('Số tiền gửi (VND)', { exact: true }).fill('14000000')
          else {
            await page.getByLabel('Nhập mã tài sản', { exact: true }).fill(category === 'stocks' ? 'VNM' : 'VFF')
            await page.waitForFunction(() => [...document.querySelectorAll('input')].some(input => input.value === '140000' && !input.disabled))
            await page.getByRole('button', { name: 'Xác nhận mua', exact: true }).waitFor({ state: 'visible' })
          }
        }
        await setup('initial=5000000')
        const submit = page.locator('button[type="submit"],button:not([type])').filter({ hasText: /Lưu giao dịch mua vàng|Mua vàng|Xác nhận mua|Mở sổ tiết kiệm/ }).last()
        if (!(platform === 'electron' && category === 'gold')) await page.getByRole('status').filter({ hasText: 'Ví đầu tư thiếu' }).waitFor()
        await submit.click()
        const confirmation = page.getByRole('dialog', {name:'Xác nhận chuyển vốn', exact:true})
        await confirmation.waitFor()
        assert.equal(await page.locator('.investment-funding-amount strong').innerText(), '9.000.000 đ')
        assert.equal(await page.evaluate(() => window.qa.saved), null)
        assert.deepEqual(await page.evaluate(() => window.qa.postings), [])
        await confirmation.getByRole('button', {name:'Hủy', exact:true}).click()
        await confirmation.waitFor({state:'hidden'})
        await page.waitForFunction(() => !document.querySelector('button[type="submit"],button:not([type])').disabled)
        assert.equal(await page.evaluate(() => window.qa.saved), null)
        assert.deepEqual(await page.evaluate(() => window.qa.postings), [])
        await submit.click()
        await confirmation.getByRole('button', {name:'Xác nhận chuyển & mua', exact:true}).click()
        await page.waitForFunction(() => window.qa.saved !== null)
        const saved = await page.evaluate(() => window.qa.saved)
        assert.equal(saved.transactions.filter(t => t.id.startsWith('TX-AUTOFUND')).reduce((sum, t) => sum + t.amountVnd, 0), 9000000)
        assert.equal(saved.transactions.reduce((sum, t) => sum + t.walletPosting.amount, 0), 0)
        if (platform === 'electron' && category === 'gold') {
          for (const decision of ['escape','close','backdrop','unmount']) {
            await setup('initial=5000000')
            await submit.click()
            await confirmation.waitFor()
            assert.equal(await confirmation.getByRole('button', {name:'Hủy',exact:true}).evaluate(button=>button===document.activeElement),true)
            await page.keyboard.press('Shift+Tab')
            assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Đóng xác nhận chuyển vốn')
            await page.keyboard.press('Shift+Tab')
            assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Xác nhận chuyển & mua')
            if(decision==='escape') await page.keyboard.press('Escape')
            if(decision==='close') await confirmation.getByRole('button',{name:'Đóng xác nhận chuyển vốn'}).click()
            if(decision==='backdrop') await page.locator('.investment-funding-overlay').click({position:{x:2,y:2}})
            if(decision==='unmount') await page.evaluate(()=>window.qa.unmount())
            await confirmation.waitFor({state:'hidden'})
            assert.equal(await page.evaluate(()=>window.qa.saved),null)
            assert.deepEqual(await page.evaluate(()=>window.qa.postings),[])
            assert.equal(await page.locator('#root').evaluate(element=>element.inert),false)
          }
        }
        await setup('operating=1000000')
        if (platform === 'electron' && category === 'gold') await submit.click()
        await page.getByRole('alert').filter({ hasText: 'Chưa thể mua tài sản' }).waitFor()
        if (!(platform === 'electron' && category === 'gold')) assert.equal(await submit.isDisabled(), true)
        assert.equal(await page.evaluate(() => window.qa.saved), null)
        assert.deepEqual(errors, [])
        checks.push({ platform, category, cancelNoWrites: true, exactShortfall: 9000000, insufficientBlocked: true })
        await page.close()
      }
    }
    await fs.mkdir('docs/qa', { recursive: true })
    await fs.writeFile('docs/qa/investment-auto-funding-ui.json', JSON.stringify({ verifiedAt: new Date().toISOString(), fixtureOnly: true, checks }, null, 2))
    console.log(JSON.stringify(checks, null, 2))
  } finally { await browser.close(); server.close() }
})().catch(error => { console.error(error); process.exit(1) })
