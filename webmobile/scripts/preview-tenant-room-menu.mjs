// Synthetic UI QA only. No account/password, database or Gmail connection.
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { root } from './private-config.mjs'
const dir=path.join(root,'qa/private/tenant-room-menu-preview')
await mkdir(dir,{recursive:true})
const source=`import React from 'react';import{createRoot}from'react-dom/client';import TenantHome from './src/TenantHome';
const params=new URLSearchParams(location.search);
const profile={mode:'tenant',kind:'existing',name:'Khách thuê minh họa',room:'Phòng 999',contractId:params.has('no-contract')?'':'qa-contract',email:'tenant@example.invalid',userId:'qa-user',start:'2026-10-08',floor:1,area:25,rent:3500000,electricInitial:0,waterInitial:80,invoiceDay:5,services:{electricPrice:3500,waterPrice:18000,internetPrice:100000,cleaningPrice:30000},assets:params.has('empty')?[]:params.has('unavailable')?null:[{id:'qa-1',name:'Điều hòa',quantity:1,status:'ok'},{id:'qa-2',name:'Tủ quần áo',quantity:2,status:'repairing'},{id:'qa-3',name:'Máy nước nóng',quantity:1,status:'error'}]};
if(params.has('approved'))Object.assign(profile,{name:'Đỗ Kim Ngân',area:null,electricInitial:10,waterInitial:10,services:{electricPrice:3200,waterPrice:35000,internetPrice:50000,cleaningPrice:70000},assets:[{id:'qa-reference-1',name:'Bóng đèn',quantity:1,status:'ok'},{id:'qa-reference-2',name:'Thiết bị vệ sinh',quantity:1,status:'ok'}]});
window.fetch=async(url)=>{if(url!=='/api/auth')throw new Error('QA blocks external request');return Response.json({ok:true,profile})};
createRoot(document.getElementById('root')).render(<TenantHome profile={profile} onLogout={async()=>{document.getElementById('root').textContent='Đã đăng xuất QA'}}/>);`
const bundle=await build({stdin:{contents:source,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}})
await writeFile(path.join(dir,'bundle.js'),bundle.outputFiles[0].text)
await writeFile(path.join(dir,'index.html'),'<!doctype html><html lang="vi"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><div id="root"></div><script type="module" src="/bundle.js"></script></html>')
const server=createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost'),name=url.pathname
  const target=name==='/bundle.js'?path.join(dir,'bundle.js'):name==='/styles.css'?path.join(root,'src/styles.css'):name.startsWith('/assets/')?path.join(root,'public',name):path.join(dir,'index.html')
  const data=await readFile(target)
  res.setHeader('Content-Type',target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':target.endsWith('.png')?'image/png':target.endsWith('.woff2')?'font/woff2':'text/html; charset=utf-8')
  res.end(data)
 }catch {res.statusCode=404;res.end('Not found')}
})
server.listen(5297,'127.0.0.1',()=>console.log('Tenant menu UI QA: http://127.0.0.1:5297 (synthetic room/assets only)'))
