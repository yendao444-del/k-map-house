import React from 'react'
import { createRoot } from 'react-dom/client'
import TenantHome from '../../src/TenantHome'
import type { TenantProfile } from '../../src/auth-client'

const scenario=new URLSearchParams(location.search).get('case')||'working'
let streams:MediaStream[]=[]
const media=async()=>{
 if(scenario==='denied')throw new DOMException('QA denied','NotAllowedError')
 const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1440
 const ctx=canvas.getContext('2d')!
 const image=new Image();image.src='/assets/meter-electric.webp';await image.decode()
 let x=0
 function draw(){ctx.fillStyle='#EDF9F1';ctx.fillRect(0,0,1920,1440);ctx.drawImage(image,0,0,1920,1440);ctx.fillStyle='#064A31';ctx.fillRect(x++%1900,0,20,12)}
 draw();const timer=setInterval(draw,50),stream=canvas.captureStream(20);streams.push(stream)
 const track=stream.getVideoTracks()[0],stop=track.stop.bind(track)
 track.stop=()=>{clearInterval(timer);stop()}
 return stream
}
if(scenario==='unsupported')Object.defineProperty(navigator,'mediaDevices',{value:undefined,configurable:true})
else Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:media},configurable:true})
if(['autoplay','fullscreen','no-frames'].includes(scenario)){
 const play=HTMLMediaElement.prototype.play
 HTMLMediaElement.prototype.play=function(){
  if(scenario==='autoplay')return Promise.reject(new DOMException('QA blocked','NotAllowedError'))
  if(scenario==='fullscreen'){this.dispatchEvent(new Event('webkitbeginfullscreen'));return Promise.resolve()}
  return new Promise(()=>{})
 }
 window.addEventListener('pagehide',()=>{HTMLMediaElement.prototype.play=play},{once:true})
}
// Exercise legacy WebViews without these recent APIs.
if(scenario==='legacy'){
 Object.defineProperty(AbortSignal,'any',{value:undefined,configurable:true})
 Object.defineProperty(AbortSignal,'timeout',{value:undefined,configurable:true})
}
window.addEventListener('pagehide',()=>streams.forEach(s=>s.getTracks().forEach(t=>t.stop())))
const profile:TenantProfile={mode:'tenant',kind:'existing',simulation:true,name:'Camera QA · dữ liệu tổng hợp',room:'Phòng 999',contractId:'camera-qa',email:'qa@invalid.test',userId:'qa',tenantId:'qa',start:'2026-10-08',rent:3500000,assets:[]}
createRoot(document.getElementById('root')!).render(<React.StrictMode><TenantHome profile={profile} onLogout={async()=>{}}/></React.StrictMode>)
