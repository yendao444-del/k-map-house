const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const ts = require('typescript')
const workspace = path.resolve(__dirname, '../../..')
const template = {}
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(workspace, 'src/shared/contract-email-template.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(template)
const html = template.contractEmailHtml({ tenantName:'Khách thuê thử nghiệm',room:'999',moveInDate:'2026-10-07',url:'https://ankhanghome-contract-test.pages.dev/contract-confirmation#token=preview-no-active-token' }).replace(`cid:${template.CONTRACT_BANNER_CID}`, '/banner.png')
fs.writeFileSync(path.join(__dirname, 'preview.html'),html)
http.createServer((request,response)=>{
  response.setHeader('Cache-Control','no-store')
  if(request.url === '/banner.png') {response.setHeader('Content-Type','image/png');response.end(fs.readFileSync(path.join(workspace,'webmobile/assets/contract-confirmation-banner.png')));return}
  if(request.url !== '/' && request.url !== '/preview.html') {response.writeHead(404);response.end();return}
  response.setHeader('Content-Type','text/html; charset=utf-8');response.end(html)
}).listen(5292,'127.0.0.1',()=>console.log('Contract email preview http://127.0.0.1:5292/'))
