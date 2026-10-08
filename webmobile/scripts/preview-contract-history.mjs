import { build } from 'esbuild'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'node:http'
import { root } from './private-config.mjs'
const dir=path.join(root,'qa/private/history-preview')
await mkdir(dir,{recursive:true})
const built=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{ContractConfirmationHistory}from'./src/renderer/src/components/ContractConfirmationHistory';const base=[{id:'1',type:'created',at:'2026-10-07T09:42:40Z'},{id:'2',type:'sent',at:'2026-10-07T09:43:00Z',email:'tenant@example.com'},{id:'3',type:'link_opened',at:'2026-10-07T09:45:00Z'},{id:'4',type:'document_viewed',at:'2026-10-07T09:45:02Z'},{id:'5',type:'confirmed',at:'2026-10-07T09:47:15Z'},{id:'6',type:'account_ready',at:'2026-10-07T09:48:00Z'}];function App(){const[open,setOpen]=React.useState(true);let mode=new URLSearchParams(location.search).get('mode');return <><button onClick={()=>setOpen(true)}>Lịch sử</button>{open&&<ContractConfirmationHistory events={mode==='empty'?[]:base} loading={mode==='loading'} error={mode==='error'?'Chưa tải được lịch sử xác nhận.':undefined} onRefresh={()=>{}} onClose={()=>setOpen(false)}/>}</>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:path.resolve(root,'..'),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}})
await writeFile(path.join(dir,'bundle.js'),built.outputFiles[0].text)
const assets=await readFile(path.join(root,'../out/renderer/index.html'),'utf8')
const css=assets.match(/href="\.\/assets\/(index-[^"]+\.css)"/)?.[1]
if(!css) throw new Error('Missing renderer CSS')
await writeFile(path.join(dir,'index.html'),`<!doctype html><html lang="vi"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/${css}"><body style="background:#f5f8f6;padding:40px"><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>`)
createServer(async(req,res)=>{let file=req.url.split('?')[0];const base=file.startsWith('/assets/')?path.join(root,'../out/renderer'):dir;const target=file==='/'?'index.html':file.slice(1);try{const data=await readFile(path.join(base,target));res.writeHead(200,{'Content-Type':target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':'text/html'});res.end(data)}catch{res.writeHead(404);res.end()}}).listen(5293,'127.0.0.1',()=>console.log('Actual history component QA: http://127.0.0.1:5293 (synthetic events only)'))
